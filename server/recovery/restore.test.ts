import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBackup } from "./backup";
import { writeEncryptedManifestAtomic } from "./manifest";
import { runRestore } from "./restore";
import type {
  DatabaseRecoveryAdapter,
  StorageKeyMapping,
  StorageRecoveryAdapter,
  StorageReference,
} from "./types";

const encryptionKey = Buffer.alloc(32, 0x6b);
const backupTime = new Date("2026-08-30T08:00:00.000Z");

class TargetDatabase implements DatabaseRecoveryAdapter {
  readonly restoreFrom = vi.fn(async (source: string) => {
    this.restoredBytes = await readFile(source);
  });
  readonly replaceStorageReferences = vi.fn(
    async (mappings: StorageKeyMapping[]) => {
      this.mappings = mappings;
    }
  );
  restoredBytes: Buffer | undefined;
  mappings: StorageKeyMapping[] = [];

  constructor(private readonly empty = true) {}

  async exportTo(): Promise<void> {
    throw new Error("not used");
  }

  async isEmpty(): Promise<boolean> {
    return this.empty;
  }

  async countCriticalTables(): Promise<Record<string, number>> {
    return { users: 1, incidents: 1, incident_evidence: 1 };
  }

  async listStorageReferences(): Promise<StorageReference[]> {
    return [];
  }

  async verifyInvariants(): Promise<Record<string, number>> {
    return { orphanEvidence: 0, orphanAssignments: 0, brokenProfiles: 0 };
  }
}

class TargetStorage implements StorageRecoveryAdapter {
  readonly objects = new Map<string, Buffer>();

  async download(key: string, destination: string): Promise<void> {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error("target object unavailable token=secret");
    await writeFile(destination, bytes);
  }

  async upload(
    originalKey: string,
    source: string,
    _contentType: string
  ): Promise<string> {
    const restoredKey = `recovery-drills/d005/${originalKey}`;
    this.objects.set(restoredKey, await readFile(source));
    return restoredKey;
  }
}

describe("runRestore", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-recovery-restore-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function createPackage() {
    const evidence = Buffer.from("synthetic restored evidence");
    const reference: StorageReference = {
      table: "incident_evidence",
      rowId: 9,
      column: "storage_key",
      key: "incident-evidence/9/photo.jpg",
      contentType: "image/jpeg",
      expectedByteSize: evidence.byteLength,
    };
    const sourceDatabase: DatabaseRecoveryAdapter = {
      exportTo: async destination => {
        await writeFile(destination, "-- synthetic SQL --\n");
      },
      restoreFrom: vi.fn(),
      isEmpty: async () => true,
      countCriticalTables: async () => ({
        users: 1,
        incidents: 1,
        incident_evidence: 1,
      }),
      listStorageReferences: async () => [reference],
      replaceStorageReferences: vi.fn(),
      verifyInvariants: async () => ({}),
    };
    const sourceStorage: StorageRecoveryAdapter = {
      download: async (_key, destination) => {
        await writeFile(destination, evidence);
      },
      upload: vi.fn(async key => key),
    };
    return runBackup({
      database: sourceDatabase,
      storage: sourceStorage,
      encryptionKey,
      outputRoot: join(root, "packages"),
      appVersion: "1.15.4",
      schemaVersion: "0002_aromatic_warhawk:123456789abc",
      sourceClass: "synthetic",
      sourceLabel: "controlled source",
      now: () => backupTime,
      randomBytes: () => Buffer.from([5, 6, 7, 8]),
    });
  }

  function restoreClock() {
    const values = [
      new Date("2026-08-30T08:20:00.000Z"),
      new Date("2026-08-30T08:21:00.000Z"),
    ];
    return () => values.shift() ?? new Date("2026-08-30T08:21:00.000Z");
  }

  it("restores the database, uploads objects under new keys and verifies the result", async () => {
    const backup = await createPackage();
    const targetDatabase = new TargetDatabase();
    const targetStorage = new TargetStorage();

    const report = await runRestore({
      packageRoot: backup.packageRoot,
      targetDatabase,
      targetStorage,
      encryptionKey,
      scratchRoot: join(root, "scratch"),
      recoveryReferenceTime: new Date("2026-08-30T08:20:00.000Z"),
      now: restoreClock(),
    });

    expect(report).toMatchObject({
      status: "approved",
      rpoMs: 1_200_000,
      rtoMs: 60_000,
      objectCount: 1,
      failedChecks: [],
    });
    expect(targetDatabase.restoredBytes?.toString("utf8")).toBe(
      "-- synthetic SQL --\n"
    );
    expect(targetDatabase.mappings).toEqual([
      {
        originalKey: "incident-evidence/9/photo.jpg",
        restoredKey: "recovery-drills/d005/incident-evidence/9/photo.jpg",
        references: backup.manifest.artifacts[1]?.references,
      },
    ]);
  });

  it("refuses a non-empty target before restoring the database", async () => {
    const backup = await createPackage();
    const targetDatabase = new TargetDatabase(false);

    await expect(
      runRestore({
        packageRoot: backup.packageRoot,
        targetDatabase,
        targetStorage: new TargetStorage(),
        encryptionKey,
        scratchRoot: join(root, "scratch"),
        recoveryReferenceTime: new Date("2026-08-30T08:20:00.000Z"),
        now: restoreClock(),
      })
    ).rejects.toThrow("target database must be empty");
    expect(targetDatabase.restoreFrom).not.toHaveBeenCalled();
  });

  it("rejects a corrupted artifact before restoring the database", async () => {
    const backup = await createPackage();
    const databaseArtifact = backup.manifest.artifacts[0]!;
    await appendFile(
      join(backup.packageRoot, databaseArtifact.relativePath),
      Buffer.from([0xff])
    );
    const targetDatabase = new TargetDatabase();

    await expect(
      runRestore({
        packageRoot: backup.packageRoot,
        targetDatabase,
        targetStorage: new TargetStorage(),
        encryptionKey,
        scratchRoot: join(root, "scratch"),
        recoveryReferenceTime: new Date("2026-08-30T08:20:00.000Z"),
        now: restoreClock(),
      })
    ).rejects.toThrow("artifact hash mismatch");
    expect(targetDatabase.restoreFrom).not.toHaveBeenCalled();
  });

  it("rejects plaintext metadata that does not match the decrypted database", async () => {
    const backup = await createPackage();
    const alteredManifest = {
      ...backup.manifest,
      artifacts: backup.manifest.artifacts.map((artifact, index) =>
        index === 0
          ? { ...artifact, plaintextSha256: "0".repeat(64) }
          : artifact
      ),
    };
    await writeEncryptedManifestAtomic(
      backup.packageRoot,
      alteredManifest,
      encryptionKey
    );
    const targetDatabase = new TargetDatabase();

    await expect(
      runRestore({
        packageRoot: backup.packageRoot,
        targetDatabase,
        targetStorage: new TargetStorage(),
        encryptionKey,
        scratchRoot: join(root, "scratch"),
        recoveryReferenceTime: new Date("2026-08-30T08:20:00.000Z"),
        now: restoreClock(),
      })
    ).rejects.toThrow("artifact plaintext mismatch");
    expect(targetDatabase.restoreFrom).not.toHaveBeenCalled();
  });
});
