import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runBackup } from "./backup";
import { readRecoveryConfig } from "./config";
import { MysqlCliRecoveryAdapter } from "./databaseAdapter";
import { readRecoveryVersionMetadata } from "./manifest";
import { runRestore } from "./restore";
import { ForgeRecoveryStorageAdapter } from "./storageAdapter";

let exerciseRoot: string;

beforeAll(async () => {
  exerciseRoot = await mkdtemp(join(tmpdir(), "dispatch-d005b-"));
});

afterAll(async () => {
  await rm(exerciseRoot, { recursive: true, force: true });
});

it("restores database and referenced files in disposable infrastructure", async () => {
  const backupConfig = readRecoveryConfig(process.env, "backup");
  const restoreConfig = readRecoveryConfig(process.env, "restore");
  if (
    backupConfig.command !== "backup" ||
    restoreConfig.command !== "restore"
  ) {
    throw new Error("invalid recovery drill configuration");
  }
  const versions = await readRecoveryVersionMetadata(process.cwd());
  const sourceDatabase = new MysqlCliRecoveryAdapter({
    databaseUrl: backupConfig.sourceDatabaseUrl,
  });
  const sourceStorage = new ForgeRecoveryStorageAdapter({
    apiUrl: backupConfig.sourceStorage.apiUrl,
    apiKey: backupConfig.sourceStorage.apiKey,
    targetPrefix: "",
  });
  const targetDatabase = new MysqlCliRecoveryAdapter({
    databaseUrl: restoreConfig.targetDatabaseUrl,
  });
  const targetStorage = new ForgeRecoveryStorageAdapter({
    apiUrl: restoreConfig.targetStorage.apiUrl,
    apiKey: restoreConfig.targetStorage.apiKey,
    targetPrefix: restoreConfig.targetStorage.prefix,
  });

  const backup = await runBackup({
    database: sourceDatabase,
    storage: sourceStorage,
    encryptionKey: backupConfig.encryptionKey,
    outputRoot: join(exerciseRoot, "packages"),
    appVersion: versions.appVersion,
    schemaVersion: versions.schemaVersion,
    sourceClass: backupConfig.sourceClass,
    sourceLabel: "D-005B synthetic non-production source",
  });
  const report = await runRestore({
    packageRoot: backup.packageRoot,
    targetDatabase,
    targetStorage,
    encryptionKey: restoreConfig.encryptionKey,
    scratchRoot: join(exerciseRoot, "scratch"),
    recoveryReferenceTime: new Date(),
  });

  expect(report.status).toBe("approved");
  expect(report.rtoMs).toBeLessThanOrEqual(7_200_000);
  expect(report.rpoMs).toBeLessThanOrEqual(3_600_000);
});
