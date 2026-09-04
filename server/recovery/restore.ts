import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { decryptFile, sha256File } from "./crypto";
import { readAndValidateManifest } from "./manifest";
import type {
  DatabaseRecoveryAdapter,
  RecoveryVerificationReport,
  StorageKeyMapping,
  StorageRecoveryAdapter,
} from "./types";
import { verifyRestoredPackage } from "./verifier";

export interface RunRestoreOptions {
  packageRoot: string;
  targetDatabase: DatabaseRecoveryAdapter;
  targetStorage: StorageRecoveryAdapter;
  encryptionKey: Buffer;
  scratchRoot: string;
  recoveryReferenceTime: Date;
  now?: () => Date;
}

async function verifyEncryptedArtifacts(
  packageRoot: string,
  artifacts: Array<{ relativePath: string; encryptedSha256: string }>
): Promise<void> {
  try {
    for (const artifact of artifacts) {
      const actualHash = await sha256File(
        join(packageRoot, artifact.relativePath)
      );
      if (actualHash !== artifact.encryptedSha256) {
        throw new Error("hash differs");
      }
    }
  } catch {
    throw new Error("artifact hash mismatch");
  }
}

async function decryptAndValidateArtifact(
  packageRoot: string,
  artifact: {
    relativePath: string;
    encryptedSha256: string;
    plaintextSha256: string;
    byteSize: number;
  },
  destination: string,
  encryptionKey: Buffer
): Promise<void> {
  let decrypted: { plaintextSha256: string; byteSize: number };
  try {
    decrypted = await decryptFile(
      join(packageRoot, artifact.relativePath),
      destination,
      encryptionKey,
      artifact.encryptedSha256
    );
  } catch {
    throw new Error("artifact authentication failed");
  }
  if (
    decrypted.plaintextSha256 !== artifact.plaintextSha256 ||
    decrypted.byteSize !== artifact.byteSize
  ) {
    throw new Error("artifact plaintext mismatch");
  }
}

export async function runRestore(
  options: RunRestoreOptions
): Promise<RecoveryVerificationReport> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const manifest = await readAndValidateManifest(
    options.packageRoot,
    options.encryptionKey
  );
  const databaseArtifacts = manifest.artifacts.filter(
    artifact => artifact.kind === "database"
  );
  const objectArtifacts = manifest.artifacts.filter(
    artifact => artifact.kind === "object"
  );
  if (
    databaseArtifacts.length !== 1 ||
    databaseArtifacts[0]!.logicalKey !== null ||
    objectArtifacts.some(artifact => artifact.logicalKey === null)
  ) {
    throw new Error("recovery package artifact inventory is invalid");
  }

  await verifyEncryptedArtifacts(options.packageRoot, manifest.artifacts);
  if (!(await options.targetDatabase.isEmpty())) {
    throw new Error("target database must be empty");
  }

  await mkdir(options.scratchRoot, { recursive: true, mode: 0o700 });
  const restoreRoot = await mkdtemp(join(options.scratchRoot, ".restore-"));
  const databasePlaintext = join(restoreRoot, "database.sql");
  const objectPlaintext = join(restoreRoot, "object.plaintext");
  const keyMappings: StorageKeyMapping[] = [];

  try {
    const databaseArtifact = databaseArtifacts[0]!;
    await decryptAndValidateArtifact(
      options.packageRoot,
      databaseArtifact,
      databasePlaintext,
      options.encryptionKey
    );
    await options.targetDatabase.restoreFrom(databasePlaintext);

    for (const artifact of objectArtifacts) {
      await decryptAndValidateArtifact(
        options.packageRoot,
        artifact,
        objectPlaintext,
        options.encryptionKey
      );
      const originalKey = artifact.logicalKey!;
      const restoredKey = await options.targetStorage.upload(
        originalKey,
        objectPlaintext,
        artifact.contentType
      );
      keyMappings.push({
        originalKey,
        restoredKey,
        references: artifact.references,
      });
      await rm(objectPlaintext, { force: true });
    }

    await options.targetDatabase.replaceStorageReferences(keyMappings);
    return await verifyRestoredPackage({
      manifest,
      targetDatabase: options.targetDatabase,
      targetStorage: options.targetStorage,
      keyMappings,
      scratchRoot: options.scratchRoot,
      encryptionKey: options.encryptionKey,
      startedAt,
      recoveryReferenceTime: options.recoveryReferenceTime,
      now,
    });
  } finally {
    await rm(restoreRoot, { recursive: true, force: true });
  }
}
