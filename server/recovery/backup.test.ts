import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBackup, type RunBackupOptions } from "./backup";
import { readAndValidateManifest } from "./manifest";
import type {
  DatabaseRecoveryAdapter,
  StorageRecoveryAdapter,
  StorageReference,
} from "./types";

const encryptionKey = Buffer.alloc(32, 0x5a);
const createdAt = new Date("2026-08-30T08:00:00.000Z");
const runId = "d005-20260830T080000000Z-01020304";

describe("runBackup", () => {
  let root: string;
  let outputRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-recovery-backup-"));
    outputRoot = join(root, "recovery-packages");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function createDatabase(
    references: StorageReference[]
  ): DatabaseRecoveryAdapter {
    return {
      exportTo: vi.fn(async destination => {
        await writeFile(destination, "-- synthetic database export --\n");
      }),
      restoreFrom: vi.fn(),
      isEmpty: vi.fn(async () => true),
      countCriticalTables: vi.fn(async () => ({
        users: 1,
        incidents: 1,
        incident_evidence: 1,
      })),
      listStorageReferences: vi.fn(async () => references),
      replaceStorageReferences: vi.fn(),
      verifyInvariants: vi.fn(async () => ({})),
    };
  }

  function createStorage(objects: Map<string, Buffer>): StorageRecoveryAdapter {
    return {
      download: vi.fn(async (key, destination) => {
        const bytes = objects.get(key);
        if (!bytes) {
          throw new Error(
            "missing object at https://signed.test/token=storage-secret"
          );
        }
        await writeFile(destination, bytes);
      }),
      upload: vi.fn(async key => `recovery-drills/d005/${key}`),
    };
  }

  function options(
    database: DatabaseRecoveryAdapter,
    storage: StorageRecoveryAdapter
  ): RunBackupOptions {
    return {
      database,
      storage,
      encryptionKey,
      outputRoot,
      appVersion: "1.15.4",
      schemaVersion: "0002_aromatic_warhawk:123456789abc",
      sourceClass: "synthetic",
      sourceLabel: "mysql://source:database-secret@db.test/dispatch_source",
      now: () => createdAt,
      randomBytes: () => Buffer.from([1, 2, 3, 4]),
    };
  }

  async function textOutputs(path: string): Promise<string> {
    const contents: string[] = [];
    for (const relativePath of await readdir(path, { recursive: true })) {
      if (!/\.(json|txt|md)$/.test(relativePath)) continue;
      contents.push(await readFile(join(path, relativePath), "utf8"));
    }
    return contents.join("\n");
  }

  it("publishes a complete encrypted package only after database and objects pass", async () => {
    const evidence = Buffer.from("synthetic evidence");
    const avatar = Buffer.from("synthetic avatar");
    const references: StorageReference[] = [
      {
        table: "user_profiles",
        rowId: 7,
        column: "avatar_storage_key",
        key: "profile-photos/7/avatar.png",
        contentType: "image/png",
        expectedByteSize: null,
      },
      {
        table: "incident_evidence",
        rowId: 9,
        column: "storage_key",
        key: "incident-evidence/9/photo.jpg",
        contentType: "image/jpeg",
        expectedByteSize: evidence.byteLength,
      },
    ];
    const database = createDatabase(references);
    const storage = createStorage(
      new Map([
        ["incident-evidence/9/photo.jpg", evidence],
        ["profile-photos/7/avatar.png", avatar],
      ])
    );

    const result = await runBackup(options(database, storage));

    expect(result.packageRoot).toBe(join(outputRoot, runId));
    expect(result.manifest.status).toBe("complete");
    expect(result.manifest.artifacts.map(item => item.kind)).toEqual([
      "database",
      "object",
      "object",
    ]);
    expect(result.manifest.artifacts.map(item => item.logicalKey)).toEqual([
      null,
      "incident-evidence/9/photo.jpg",
      "profile-photos/7/avatar.png",
    ]);
    await expect(
      readAndValidateManifest(result.packageRoot, encryptionKey)
    ).resolves.toEqual(result.manifest);
    await expect(
      stat(join(outputRoot, `${runId}.partial`))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(join(result.packageRoot, ".database.sql.plaintext"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(database.exportTo).toHaveBeenCalledTimes(1);
    expect(storage.download).toHaveBeenCalledTimes(2);

    const outputs = await textOutputs(result.packageRoot);
    expect(outputs).not.toMatch(
      /database-secret|storage-secret|signed\.test|mysql:\/\//
    );
    expect(outputs).not.toContain(encryptionKey.toString("base64"));
  });

  it("keeps an incomplete package unpublished and records only a sanitized failure", async () => {
    const references: StorageReference[] = [
      {
        table: "incident_evidence",
        rowId: 9,
        column: "storage_key",
        key: "incident-evidence/9/missing.jpg",
        contentType: "image/jpeg",
        expectedByteSize: 100,
      },
    ];
    const database = createDatabase(references);
    const storage = createStorage(new Map());

    await expect(runBackup(options(database, storage))).rejects.toThrow(
      "backup incomplete"
    );

    const partialRoot = join(outputRoot, `${runId}.partial`);
    await expect(stat(join(outputRoot, runId))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      stat(join(partialRoot, "recovery-envelope.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const report = JSON.parse(
      await readFile(join(partialRoot, "reports", "backup-report.json"), "utf8")
    );
    expect(report).toEqual({
      runId,
      createdAt: createdAt.toISOString(),
      status: "invalid",
      failedStage: "object-copy",
    });
    expect(await textOutputs(partialRoot)).not.toMatch(
      /database-secret|storage-secret|signed\.test|mysql:\/\//
    );
    await expect(
      stat(join(partialRoot, ".object.plaintext"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an object whose downloaded size differs from the database inventory", async () => {
    const references: StorageReference[] = [
      {
        table: "incident_evidence",
        rowId: 9,
        column: "storage_key",
        key: "incident-evidence/9/photo.jpg",
        contentType: "image/jpeg",
        expectedByteSize: 999,
      },
    ];
    const database = createDatabase(references);
    const storage = createStorage(
      new Map([
        ["incident-evidence/9/photo.jpg", Buffer.from("short evidence")],
      ])
    );

    await expect(runBackup(options(database, storage))).rejects.toThrow(
      "backup incomplete"
    );
    const report = JSON.parse(
      await readFile(
        join(outputRoot, `${runId}.partial`, "reports", "backup-report.json"),
        "utf8"
      )
    );
    expect(report.failedStage).toBe("object-validation");
  });

  it("does not alter a pre-existing partial package when the run ID collides", async () => {
    const existingRoot = join(outputRoot, `${runId}.partial`);
    const existingEnvelope = join(existingRoot, "recovery-envelope.json");
    const existingReport = join(existingRoot, "reports", "backup-report.json");
    await mkdir(join(existingRoot, "reports"), { recursive: true });
    await writeFile(existingEnvelope, "existing envelope");
    await writeFile(existingReport, "existing report");
    const database = createDatabase([]);
    const storage = createStorage(new Map());

    await expect(runBackup(options(database, storage))).rejects.toThrow(
      "backup incomplete"
    );

    await expect(readFile(existingEnvelope, "utf8")).resolves.toBe(
      "existing envelope"
    );
    await expect(readFile(existingReport, "utf8")).resolves.toBe(
      "existing report"
    );
    expect(database.exportTo).not.toHaveBeenCalled();
  });

  it("does not replace a pre-existing final package directory", async () => {
    const existingRoot = join(outputRoot, runId);
    await mkdir(existingRoot, { recursive: true });
    const database = createDatabase([]);
    const storage = createStorage(new Map());

    await expect(runBackup(options(database, storage))).rejects.toThrow(
      "backup incomplete"
    );

    expect(await readdir(existingRoot)).toEqual([]);
    expect(database.exportTo).not.toHaveBeenCalled();
    await expect(
      stat(join(outputRoot, `${runId}.partial`))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
