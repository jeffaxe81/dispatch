import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { encryptFile } from "./crypto";
import { artifactPathForKey, writeEncryptedManifestAtomic } from "./manifest";
import {
  RECOVERY_FORMAT_VERSION,
  type DatabaseRecoveryAdapter,
  type RecoveryArtifact,
  type RecoveryManifest,
  type RecoverySourceClass,
  type StorageRecoveryAdapter,
  type StorageReference,
} from "./types";

export interface RunBackupOptions {
  database: DatabaseRecoveryAdapter;
  storage: StorageRecoveryAdapter;
  encryptionKey: Buffer;
  outputRoot: string;
  appVersion: string;
  schemaVersion: string;
  sourceClass: RecoverySourceClass;
  sourceLabel: string;
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
}

interface ObjectInventory {
  key: string;
  contentType: string;
  references: StorageReference[];
  expectedByteSize: number | null;
}

type BackupStage =
  | "setup"
  | "database-export"
  | "database-inventory"
  | "object-copy"
  | "object-validation"
  | "object-encryption"
  | "manifest-publication"
  | "report-publication"
  | "package-publication";

function compactUtcTimestamp(date: Date): string {
  const iso = date.toISOString();
  return iso.replace(/[-:.]/g, "");
}

function createRunId(
  createdAt: Date,
  randomBytes: (size: number) => Buffer
): string {
  const suffix = randomBytes(4);
  if (suffix.byteLength !== 4) {
    throw new Error("backup random source must return exactly four bytes");
  }
  return `d005-${compactUtcTimestamp(createdAt)}-${suffix.toString("hex")}`;
}

function compareReferences(
  left: StorageReference,
  right: StorageReference
): number {
  return (
    left.table.localeCompare(right.table) ||
    left.rowId - right.rowId ||
    left.column.localeCompare(right.column)
  );
}

function groupObjectInventory(
  references: StorageReference[]
): ObjectInventory[] {
  const grouped = new Map<string, StorageReference[]>();
  for (const reference of references) {
    const existing = grouped.get(reference.key) ?? [];
    existing.push(reference);
    grouped.set(reference.key, existing);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, objectReferences]) => {
      const sortedReferences = [...objectReferences].sort(compareReferences);
      const contentTypes = new Set(
        sortedReferences.map(reference => reference.contentType)
      );
      const expectedSizes = new Set(
        sortedReferences
          .map(reference => reference.expectedByteSize)
          .filter((value): value is number => value !== null)
      );
      if (contentTypes.size !== 1 || expectedSizes.size > 1) {
        throw new Error("object inventory contains conflicting metadata");
      }
      return {
        key,
        contentType: sortedReferences[0]!.contentType,
        references: sortedReferences,
        expectedByteSize:
          expectedSizes.size === 1 ? [...expectedSizes][0]! : null,
      };
    });
}

async function removePlaintext(path: string): Promise<void> {
  await Promise.all([
    rm(path, { force: true }),
    rm(`${path}.partial`, { force: true }),
  ]);
}

async function writeBackupReport(
  packageRoot: string,
  report: Record<string, unknown>
): Promise<void> {
  const reportsRoot = join(packageRoot, "reports");
  const reportPath = join(reportsRoot, "backup-report.json");
  const partialPath = `${reportPath}.partial`;
  await mkdir(reportsRoot, { recursive: true, mode: 0o700 });
  await writeFile(partialPath, JSON.stringify(report), { mode: 0o600 });
  await rename(partialPath, reportPath);
}

async function removePublishableEnvelope(packageRoot: string): Promise<void> {
  await Promise.all([
    rm(join(packageRoot, "recovery-envelope.json"), { force: true }),
    rm(join(packageRoot, "recovery-envelope.json.partial"), { force: true }),
    rm(join(packageRoot, "recovery-envelope.json.lock"), { force: true }),
    rm(join(packageRoot, "reports", "backup-report.json.partial"), {
      force: true,
    }),
  ]);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function runBackup(
  options: RunBackupOptions
): Promise<{ packageRoot: string; manifest: RecoveryManifest }> {
  const createdAt = (options.now ?? (() => new Date()))();
  const id = createRunId(createdAt, options.randomBytes ?? cryptoRandomBytes);
  const packageRoot = join(options.outputRoot, id);
  const partialRoot = `${packageRoot}.partial`;
  const databasePlaintext = join(partialRoot, ".database.sql.plaintext");
  const objectPlaintext = join(partialRoot, ".object.plaintext");
  let stage: BackupStage = "setup";
  let partialRootOwned = false;

  try {
    await mkdir(options.outputRoot, { recursive: true, mode: 0o700 });
    if (await pathExists(packageRoot)) {
      throw new Error("backup package already exists");
    }
    await mkdir(partialRoot, { mode: 0o700 });
    partialRootOwned = true;
    await mkdir(join(partialRoot, "artifacts", "objects"), {
      recursive: true,
      mode: 0o700,
    });

    stage = "database-export";
    await options.database.exportTo(databasePlaintext);
    const databaseRelativePath = "artifacts/database.sql.enc";
    const databaseEncryptedPath = join(partialRoot, databaseRelativePath);
    await mkdir(dirname(databaseEncryptedPath), {
      recursive: true,
      mode: 0o700,
    });
    const encryptedDatabase = await encryptFile(
      databasePlaintext,
      databaseEncryptedPath,
      options.encryptionKey
    );
    await removePlaintext(databasePlaintext);

    const artifacts: RecoveryArtifact[] = [
      {
        kind: "database",
        relativePath: databaseRelativePath,
        logicalKey: null,
        contentType: "application/sql",
        byteSize: encryptedDatabase.byteSize,
        plaintextSha256: encryptedDatabase.plaintextSha256,
        encryptedSha256: encryptedDatabase.encryptedSha256,
        references: [],
      },
    ];

    stage = "database-inventory";
    const [tableCounts, references] = await Promise.all([
      options.database.countCriticalTables(),
      options.database.listStorageReferences(),
    ]);
    const inventory = groupObjectInventory(references);

    for (const object of inventory) {
      stage = "object-copy";
      await options.storage.download(object.key, objectPlaintext);

      stage = "object-encryption";
      const relativePath = artifactPathForKey(object.key);
      const encryptedPath = join(partialRoot, relativePath);
      await mkdir(dirname(encryptedPath), { recursive: true, mode: 0o700 });
      const encrypted = await encryptFile(
        objectPlaintext,
        encryptedPath,
        options.encryptionKey
      );
      await removePlaintext(objectPlaintext);

      stage = "object-validation";
      if (
        object.expectedByteSize !== null &&
        encrypted.byteSize !== object.expectedByteSize
      ) {
        throw new Error("object byte size differs from database inventory");
      }
      artifacts.push({
        kind: "object",
        relativePath,
        logicalKey: object.key,
        contentType: object.contentType,
        byteSize: encrypted.byteSize,
        plaintextSha256: encrypted.plaintextSha256,
        encryptedSha256: encrypted.encryptedSha256,
        references: object.references,
      });
    }

    const manifest: RecoveryManifest = {
      formatVersion: RECOVERY_FORMAT_VERSION,
      id,
      createdAt: createdAt.toISOString(),
      appVersion: options.appVersion,
      schemaVersion: options.schemaVersion,
      sourceClass: options.sourceClass,
      sourceLabel: options.sourceLabel,
      status: "complete",
      tableCounts,
      artifacts,
    };

    stage = "manifest-publication";
    await writeEncryptedManifestAtomic(
      partialRoot,
      manifest,
      options.encryptionKey
    );

    stage = "report-publication";
    await writeBackupReport(partialRoot, {
      runId: id,
      createdAt: createdAt.toISOString(),
      status: "complete",
      artifactCount: artifacts.length,
      tableCount: Object.keys(tableCounts).length,
    });

    stage = "package-publication";
    await rename(partialRoot, packageRoot);
    partialRootOwned = false;
    return { packageRoot, manifest };
  } catch {
    if (partialRootOwned) {
      await removePlaintext(databasePlaintext).catch(() => undefined);
      await removePlaintext(objectPlaintext).catch(() => undefined);
      await removePublishableEnvelope(partialRoot).catch(() => undefined);
      await writeBackupReport(partialRoot, {
        runId: id,
        createdAt: createdAt.toISOString(),
        status: "invalid",
        failedStage: stage,
      }).catch(() => undefined);
    }
    throw new Error("backup incomplete");
  }
}
