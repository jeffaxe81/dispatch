import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import { z } from "zod";
import { decryptFile, encryptBuffer, sha256File } from "./crypto";
import {
  RECOVERY_FORMAT_VERSION,
  type RecoveryEnvelope,
  type RecoveryManifest,
} from "./types";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const MAX_RECOVERY_ENVELOPE_BYTE_SIZE = 16 * 1024;
const MAX_DECRYPTED_MANIFEST_BYTE_SIZE = 64 * 1024 * 1024;
const utcTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine(value => value.endsWith("Z"), "timestamp must be UTC");

const storageReferenceSchema = z.strictObject({
  table: z.enum(["incident_evidence", "user_profiles"]),
  rowId: z.number().int().positive(),
  column: z.enum(["storage_key", "avatar_storage_key"]),
  key: z.string().min(1),
  contentType: z.string().min(1),
  expectedByteSize: z.number().int().nonnegative().nullable(),
});

function isSafeRelativeArtifactPath(value: string): boolean {
  if (
    value.length === 0 ||
    posix.isAbsolute(value) ||
    win32.isAbsolute(value)
  ) {
    return false;
  }
  return value
    .split(/[\\/]/)
    .every(segment => segment !== "" && segment !== "." && segment !== "..");
}

const recoveryArtifactSchema = z.strictObject({
  kind: z.enum(["database", "object"]),
  relativePath: z
    .string()
    .refine(
      isSafeRelativeArtifactPath,
      "artifact path must be relative and traversal-free"
    ),
  logicalKey: z.string().min(1).nullable(),
  contentType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  plaintextSha256: sha256Schema,
  encryptedSha256: sha256Schema,
  references: z.array(storageReferenceSchema),
});

const recoveryManifestSchema = z
  .strictObject({
    formatVersion: z.literal(RECOVERY_FORMAT_VERSION),
    id: z.string().min(1),
    createdAt: utcTimestampSchema,
    appVersion: z.string().min(1),
    schemaVersion: z.string().min(1),
    sourceClass: z.enum(["synthetic", "non-production"]),
    sourceLabel: z.string().min(1),
    status: z.enum(["complete", "invalid"]),
    tableCounts: z.record(z.string(), z.number().int().nonnegative()),
    artifacts: z.array(recoveryArtifactSchema),
  })
  .superRefine((manifest, context) => {
    const logicalKeys = new Set<string>();
    const relativePaths = new Set<string>();
    for (const [index, artifact] of manifest.artifacts.entries()) {
      if (relativePaths.has(artifact.relativePath)) {
        context.addIssue({
          code: "custom",
          message: "duplicate artifact relative path",
          path: ["artifacts", index, "relativePath"],
        });
      }
      relativePaths.add(artifact.relativePath);

      if (artifact.logicalKey !== null) {
        if (logicalKeys.has(artifact.logicalKey)) {
          context.addIssue({
            code: "custom",
            message: "duplicate artifact logical key",
            path: ["artifacts", index, "logicalKey"],
          });
        }
        logicalKeys.add(artifact.logicalKey);
      }
    }
  });

const recoveryEnvelopeSchema = z.strictObject({
  formatVersion: z.literal(RECOVERY_FORMAT_VERSION),
  id: z.string().min(1),
  createdAt: utcTimestampSchema,
  status: z.enum(["complete", "invalid"]),
  encryptedManifestPath: z.string().regex(/^manifests\/[a-f0-9]{64}\.enc$/),
  encryptedManifestSha256: sha256Schema,
});

const packageMetadataSchema = z.object({
  version: z.string().min(1),
});

const journalMetadataSchema = z.object({
  entries: z
    .array(
      z
        .object({
          tag: z.string().min(1),
        })
        .passthrough()
    )
    .min(1),
});

async function removeFileIfOwned(path: string, owned: boolean): Promise<void> {
  if (!owned) return;
  try {
    await unlink(path);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )) {
      throw error;
    }
  }
}

async function writeNewFile(
  path: string,
  contents: string
): Promise<{ cleanup: () => Promise<void> }> {
  const handle = await open(path, "wx", 0o600);
  let closed = false;
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    closed = true;
  } catch (error) {
    if (!closed) await handle.close().catch(() => undefined);
    await removeFileIfOwned(path, true);
    throw error;
  }
  return { cleanup: () => removeFileIfOwned(path, true) };
}

async function readRecoveryEnvelope(
  packageRoot: string
): Promise<RecoveryEnvelope> {
  const envelopePath = join(packageRoot, "recovery-envelope.json");
  const handle = await open(
    envelopePath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const envelopeStat = await handle.stat();
    if (!envelopeStat.isFile()) {
      throw new Error("invalid recovery envelope");
    }
    if (envelopeStat.size > MAX_RECOVERY_ENVELOPE_BYTE_SIZE) {
      throw new Error("recovery envelope exceeds 16 KiB");
    }

    const bytes = Buffer.alloc(envelopeStat.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.byteLength - offset,
        offset
      );
      if (bytesRead === 0) throw new Error("invalid recovery envelope");
      offset += bytesRead;
    }
    return recoveryEnvelopeSchema.parse(
      JSON.parse(bytes.toString("utf8"))
    ) as RecoveryEnvelope;
  } finally {
    await handle.close();
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function acquirePublicationLock(
  packageRoot: string
): Promise<() => Promise<void>> {
  const lockPath = join(packageRoot, "recovery-envelope.json.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) {
      throw new Error("recovery package publication already in progress");
    }
    throw error;
  }
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  return () => removeFileIfOwned(lockPath, true);
}

export function artifactPathForKey(key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return `artifacts/objects/${digest}.enc`;
}

export async function writeEncryptedManifestAtomic(
  packageRoot: string,
  manifest: RecoveryManifest,
  key: Buffer
): Promise<void> {
  const validatedManifest = recoveryManifestSchema.parse(manifest);
  const serializedManifest = JSON.stringify(validatedManifest);
  if (
    Buffer.byteLength(serializedManifest, "utf8") >
    MAX_DECRYPTED_MANIFEST_BYTE_SIZE
  ) {
    throw new Error("recovery manifest exceeds 64 MiB");
  }
  const releaseLock = await acquirePublicationLock(packageRoot);
  let pendingManifestPath: string | undefined;
  let publishedManifestPath: string | undefined;
  let publishedManifestOwned = false;
  try {
    const plaintext = Buffer.from(serializedManifest);
    const manifestsRoot = join(packageRoot, "manifests");
    await mkdir(manifestsRoot, { recursive: true, mode: 0o700 });
    pendingManifestPath = join(manifestsRoot, `.pending-${randomUUID()}.enc`);
    const encrypted = await encryptBuffer(plaintext, pendingManifestPath, key);
    const encryptedManifestPath =
      `manifests/${encrypted.encryptedSha256}.enc` as const;
    publishedManifestPath = join(packageRoot, encryptedManifestPath);
    try {
      await link(pendingManifestPath, publishedManifestPath);
      publishedManifestOwned = true;
    } catch (error) {
      if (
        !hasErrorCode(error, "EEXIST") ||
        (await sha256File(publishedManifestPath)) !== encrypted.encryptedSha256
      ) {
        throw error;
      }
    }
    await removeFileIfOwned(pendingManifestPath, true);
    pendingManifestPath = undefined;

    const envelope: RecoveryEnvelope = {
      formatVersion: RECOVERY_FORMAT_VERSION,
      id: validatedManifest.id,
      createdAt: validatedManifest.createdAt,
      status: validatedManifest.status,
      encryptedManifestPath,
      encryptedManifestSha256: encrypted.encryptedSha256,
    };
    const validatedEnvelope = recoveryEnvelopeSchema.parse(envelope);
    const envelopePath = join(packageRoot, "recovery-envelope.json");
    const envelopePartialPath = `${envelopePath}.partial`;
    const partialEnvelope = await writeNewFile(
      envelopePartialPath,
      JSON.stringify(validatedEnvelope)
    );
    try {
      await rename(envelopePartialPath, envelopePath);
      publishedManifestOwned = false;
    } catch (error) {
      await partialEnvelope.cleanup();
      throw error;
    }
  } catch (error) {
    if (pendingManifestPath) {
      await removeFileIfOwned(pendingManifestPath, true);
    }
    if (publishedManifestPath) {
      await removeFileIfOwned(publishedManifestPath, publishedManifestOwned);
    }
    throw error;
  } finally {
    await releaseLock();
  }
}

export async function readAndValidateManifest(
  packageRoot: string,
  key: Buffer
): Promise<RecoveryManifest> {
  const envelope = await readRecoveryEnvelope(packageRoot);
  if (envelope.status !== "complete") {
    throw new Error("manifest status must be complete");
  }

  const encryptedManifestPath = join(
    packageRoot,
    envelope.encryptedManifestPath
  );

  const plaintextPath = join(
    packageRoot,
    `.manifest-${randomUUID()}.decrypted`
  );
  let plaintextOwned = false;
  try {
    await decryptFile(
      encryptedManifestPath,
      plaintextPath,
      key,
      envelope.encryptedManifestSha256,
      MAX_DECRYPTED_MANIFEST_BYTE_SIZE
    );
    plaintextOwned = true;
    const manifest = recoveryManifestSchema.parse(
      JSON.parse(await readFile(plaintextPath, "utf8"))
    );
    if (manifest.status !== "complete") {
      throw new Error("manifest status must be complete");
    }
    if (
      manifest.formatVersion !== envelope.formatVersion ||
      manifest.id !== envelope.id ||
      manifest.createdAt !== envelope.createdAt ||
      manifest.status !== envelope.status
    ) {
      throw new Error("manifest does not match recovery envelope");
    }
    return manifest;
  } finally {
    await removeFileIfOwned(plaintextPath, plaintextOwned);
  }
}

export async function readRecoveryVersionMetadata(
  projectRoot: string
): Promise<{ appVersion: string; schemaVersion: string }> {
  const [packageBytes, journalBytes] = await Promise.all([
    readFile(join(projectRoot, "package.json")),
    readFile(join(projectRoot, "drizzle", "meta", "_journal.json")),
  ]);
  const packageMetadata = packageMetadataSchema.parse(
    JSON.parse(packageBytes.toString("utf8"))
  );
  const journalMetadata = journalMetadataSchema.parse(
    JSON.parse(journalBytes.toString("utf8"))
  );
  const lastMigration = journalMetadata.entries.at(-1);
  if (!lastMigration) {
    throw new Error("recovery migration journal must not be empty");
  }
  const journalHash = createHash("sha256").update(journalBytes).digest("hex");
  return {
    appVersion: packageMetadata.version,
    schemaVersion: `${lastMigration.tag}:${journalHash.slice(0, 12)}`,
  };
}
