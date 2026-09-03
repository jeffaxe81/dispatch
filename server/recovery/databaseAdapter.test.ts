import { EventEmitter } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DatabaseRecoveryProcessError,
  MysqlCliRecoveryAdapter,
} from "./databaseAdapter";
import type { StorageKeyMapping } from "./types";

type QueryResult = Record<string, unknown>[];

class FakeConnection {
  readonly queries: Array<{ sql: string; values: unknown[] | undefined }> = [];
  readonly lifecycle: string[] = [];
  private readonly results: QueryResult[];

  constructor(results: QueryResult[] = []) {
    this.results = results;
  }

  async query(sql: string, values?: unknown[]): Promise<[QueryResult]> {
    this.queries.push({ sql, values });
    return [this.results.shift() ?? []];
  }

  async beginTransaction(): Promise<void> {
    this.lifecycle.push("begin");
  }

  async commit(): Promise<void> {
    this.lifecycle.push("commit");
  }

  async rollback(): Promise<void> {
    this.lifecycle.push("rollback");
  }

  async end(): Promise<void> {
    this.lifecycle.push("end");
  }
}

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => {
    this.stdin.destroy();
    this.stdout.destroy();
    this.stderr.destroy();
    this.emit("close", null, "SIGTERM");
    return true;
  });
}

function successfulSpawn(stdout = "-- dump --\n") {
  return vi.fn(() => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stdout.end(stdout);
      child.stderr.end();
      child.emit("close", 0, null);
    });
    return child;
  });
}

describe("MysqlCliRecoveryAdapter", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-recovery-db-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function createAdapter(
    spawnProcess = successfulSpawn(),
    connection = new FakeConnection()
  ) {
    return {
      adapter: new MysqlCliRecoveryAdapter({
        databaseUrl:
          "mysql://recovery_user:secret@db.example.test:3307/dispatch_source",
        spawnProcess: spawnProcess as never,
        connectDatabase: vi.fn(async () => connection) as never,
      }),
      connection,
      spawnProcess,
    };
  }

  it("passes the password only through MYSQL_PWD", async () => {
    const { adapter, spawnProcess } = createAdapter();

    await adapter.exportTo(join(root, "database.sql"));

    expect(spawnProcess).toHaveBeenCalledWith(
      "mysqldump",
      expect.arrayContaining([
        "--single-transaction",
        "--skip-lock-tables",
        "--no-tablespaces",
        "dispatch_source",
      ]),
      expect.objectContaining({
        shell: false,
        env: expect.objectContaining({ MYSQL_PWD: "secret" }),
      })
    );
    expect(JSON.stringify(spawnProcess.mock.calls)).not.toContain(
      "--password=secret"
    );
    expect(spawnProcess.mock.calls[0]?.[1]?.slice(0, 2)).toEqual([
      "--no-defaults",
      "--no-login-paths",
    ]);
    const childEnvironment = spawnProcess.mock.calls[0]?.[2]?.env ?? {};
    expect(
      Object.keys(childEnvironment).every(key =>
        ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "MYSQL_PWD"].includes(key)
      )
    ).toBe(true);
    expect(Object.values(childEnvironment)).not.toContain(undefined);
    expect(childEnvironment).not.toHaveProperty("BUILT_IN_FORGE_API_KEY");
    expect(childEnvironment).not.toHaveProperty("RECOVERY_ENCRYPTION_KEY");
    expect(await readFile(join(root, "database.sql"), "utf8")).toBe(
      "-- dump --\n"
    );
  });

  it("does not pass undefined or unrelated variables to the child", async () => {
    const originalLocale = process.env.LC_ALL;
    delete process.env.LC_ALL;
    try {
      const { adapter, spawnProcess } = createAdapter();

      await adapter.exportTo(join(root, "database.sql"));

      const childEnvironment = spawnProcess.mock.calls[0]?.[2]?.env ?? {};
      expect(childEnvironment).not.toHaveProperty("LC_ALL");
      expect(Object.values(childEnvironment)).not.toContain(undefined);
    } finally {
      if (originalLocale === undefined) delete process.env.LC_ALL;
      else process.env.LC_ALL = originalLocale;
    }
  });

  it("delimits a database name that starts with a dash and rejects malformed names", async () => {
    const spawnProcess = successfulSpawn();
    const adapter = new MysqlCliRecoveryAdapter({
      databaseUrl:
        "mysql://recovery_user:secret@db.example.test/-looks-like-an-option",
      spawnProcess: spawnProcess as never,
    });

    await adapter.exportTo(join(root, "database.sql"));

    expect(spawnProcess.mock.calls[0]?.[1]?.slice(-2)).toEqual([
      "--",
      "-looks-like-an-option",
    ]);
    const source = join(root, "database.sql");
    await writeFile(source, "SELECT 1;\n");
    await adapter.restoreFrom(source);
    expect(spawnProcess.mock.calls[1]?.[1]?.slice(-2)).toEqual([
      "--",
      "-looks-like-an-option",
    ]);
    expect(
      () =>
        new MysqlCliRecoveryAdapter({
          databaseUrl:
            "mysql://recovery_user:secret@db.example.test/dispatch%2Fsource",
          spawnProcess: vi.fn() as never,
        })
    ).toThrow("databaseUrl must include a safe database name");
  });

  it("never drops or creates the target database", async () => {
    const { adapter, spawnProcess } = createAdapter();
    const source = join(root, "database.sql");
    await writeFile(source, "SELECT 1;\n");

    await adapter.restoreFrom(source);

    const call = JSON.stringify(spawnProcess.mock.calls);
    expect(call).not.toMatch(/DROP|CREATE DATABASE|mysqladmin/i);
    expect(spawnProcess).toHaveBeenCalledWith(
      "mysql",
      expect.arrayContaining(["dispatch_source"]),
      expect.objectContaining({ shell: false })
    );
    expect(spawnProcess.mock.calls[0]?.[1]?.slice(0, 2)).toEqual([
      "--no-defaults",
      "--no-login-paths",
    ]);
    const child = spawnProcess.mock.results[0]?.value as FakeChild;
    expect(child.stdin.read()?.toString()).toBe("SELECT 1;\n");
  });

  it("terminates mysql when the restore source stream fails", async () => {
    const child = new FakeChild();
    const spawnProcess = vi.fn(() => child);
    const { adapter } = createAdapter(spawnProcess);

    await expect(
      adapter.restoreFrom(join(root, "does-not-exist.sql"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.stdin.destroyed).toBe(true);
  });

  it("uses fixed inventory queries and maps stored object references", async () => {
    const connection = new FakeConnection([
      [
        {
          id: 7,
          storage_key: "evidence/7.jpg",
          file_name: "scene.jpg",
          content_type: "image/jpeg",
          byte_size: 42,
        },
      ],
      [
        {
          id: 8,
          avatar_storage_key: "avatars/8.png",
          avatar_content_type: "image/png",
        },
      ],
    ]);
    const { adapter } = createAdapter(successfulSpawn(), connection);

    await expect(adapter.listStorageReferences()).resolves.toEqual([
      {
        table: "incident_evidence",
        rowId: 7,
        column: "storage_key",
        key: "evidence/7.jpg",
        contentType: "image/jpeg",
        expectedByteSize: 42,
      },
      {
        table: "user_profiles",
        rowId: 8,
        column: "avatar_storage_key",
        key: "avatars/8.png",
        contentType: "image/png",
        expectedByteSize: null,
      },
    ]);
    expect(connection.queries.map(query => query.sql)).toEqual([
      "SELECT id, storage_key, file_name, content_type, byte_size FROM incident_evidence",
      "SELECT id, avatar_storage_key, avatar_content_type FROM user_profiles WHERE avatar_storage_key IS NOT NULL",
    ]);
    expect(connection.lifecycle).toEqual(["end"]);
  });

  it("uses only fixed table and column updates inside one transaction", async () => {
    const { adapter, connection } = createAdapter();
    const mappings: StorageKeyMapping[] = [
      {
        originalKey: "evidence/7.jpg",
        restoredKey: "recovery/evidence/7.jpg",
        references: [
          {
            table: "incident_evidence",
            rowId: 7,
            column: "storage_key",
            key: "evidence/7.jpg",
            contentType: "image/jpeg",
            expectedByteSize: 42,
          },
        ],
      },
      {
        originalKey: "avatars/8.png",
        restoredKey: "recovery/avatars/8.png",
        references: [
          {
            table: "user_profiles",
            rowId: 8,
            column: "avatar_storage_key",
            key: "avatars/8.png",
            contentType: "image/png",
            expectedByteSize: null,
          },
        ],
      },
    ];

    await adapter.replaceStorageReferences(mappings);

    expect(connection.lifecycle).toEqual(["begin", "commit", "end"]);
    expect(connection.queries).toEqual([
      {
        sql: "UPDATE incident_evidence SET storage_key = ? WHERE id = ? AND storage_key = ?",
        values: ["recovery/evidence/7.jpg", 7, "evidence/7.jpg"],
      },
      {
        sql: "UPDATE user_profiles SET avatar_storage_key = ? WHERE id = ? AND avatar_storage_key = ?",
        values: ["recovery/avatars/8.png", 8, "avatars/8.png"],
      },
    ]);
  });

  it("rolls back and closes the connection when a storage update fails", async () => {
    const connection = new FakeConnection();
    const failure = new Error("update failed");
    connection.query = async () => {
      throw failure;
    };
    const { adapter } = createAdapter(successfulSpawn(), connection);

    await expect(
      adapter.replaceStorageReferences([
        {
          originalKey: "evidence/7.jpg",
          restoredKey: "recovery/evidence/7.jpg",
          references: [
            {
              table: "incident_evidence",
              rowId: 7,
              column: "storage_key",
              key: "evidence/7.jpg",
              contentType: "image/jpeg",
              expectedByteSize: 42,
            },
          ],
        },
      ])
    ).rejects.toThrow(failure);
    expect(connection.lifecycle).toEqual(["begin", "rollback", "end"]);
    expect(connection.lifecycle).not.toContain("commit");
  });

  it("counts only the fixed critical tables and fixed recovery invariants", async () => {
    const connection = new FakeConnection([
      [{ count: 1 }],
      [{ count: 2 }],
      [{ count: 3 }],
      [{ count: 4 }],
      [{ count: 5 }],
      [{ count: 6 }],
      [{ count: 7 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 1 }],
    ]);
    const { adapter } = createAdapter(successfulSpawn(), connection);

    await expect(adapter.countCriticalTables()).resolves.toEqual({
      users: 1,
      user_profiles: 2,
      teams: 3,
      incidents: 4,
      incident_assignments: 5,
      incident_evidence: 6,
      audit_logs: 7,
    });
    await expect(adapter.verifyInvariants()).resolves.toEqual({
      orphanEvidence: 0,
      orphanAssignments: 0,
      brokenProfileUserLinks: 1,
    });
    expect(connection.queries.map(query => query.sql)).toEqual([
      "SELECT COUNT(*) AS count FROM users",
      "SELECT COUNT(*) AS count FROM user_profiles",
      "SELECT COUNT(*) AS count FROM teams",
      "SELECT COUNT(*) AS count FROM incidents",
      "SELECT COUNT(*) AS count FROM incident_assignments",
      "SELECT COUNT(*) AS count FROM incident_evidence",
      "SELECT COUNT(*) AS count FROM audit_logs",
      "SELECT COUNT(*) AS count FROM incident_evidence AS evidence LEFT JOIN incidents AS incident ON incident.id = evidence.incident_id WHERE incident.id IS NULL",
      "SELECT COUNT(*) AS count FROM incident_assignments AS assignment LEFT JOIN incidents AS incident ON incident.id = assignment.incident_id WHERE incident.id IS NULL",
      "SELECT COUNT(*) AS count FROM user_profiles AS profile LEFT JOIN users AS user ON user.id = profile.user_id WHERE user.id IS NULL",
    ]);
  });

  it("treats the schema as empty only when it has no base tables", async () => {
    const emptyConnection = new FakeConnection([[{ count: 0 }]]);
    const populatedConnection = new FakeConnection([[{ count: 1 }]]);

    await expect(
      createAdapter(successfulSpawn(), emptyConnection).adapter.isEmpty()
    ).resolves.toBe(true);
    await expect(
      createAdapter(successfulSpawn(), populatedConnection).adapter.isEmpty()
    ).resolves.toBe(false);
    expect(emptyConnection.queries[0]?.sql).toBe(
      "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
    );
  });

  it("caps and sanitizes a failed child process error", async () => {
    const spawnProcess = vi.fn(() => {
      const child = new FakeChild();
      queueMicrotask(() => {
        child.stdout.end();
        child.stderr.end(`connection failed for secret ${"x".repeat(9_000)}`);
        child.emit("close", 2, null);
      });
      return child;
    });
    const { adapter } = createAdapter(spawnProcess);

    await expect(adapter.exportTo(join(root, "failed.sql"))).rejects.toEqual(
      expect.objectContaining({
        name: "DatabaseRecoveryProcessError",
        exitCode: 2,
      })
    );
    await expect(
      adapter.exportTo(join(root, "failed-again.sql"))
    ).rejects.not.toThrow("secret");
    try {
      await adapter.exportTo(join(root, "failed-third.sql"));
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseRecoveryProcessError);
      expect((error as Error).message.length).toBeLessThanOrEqual(8_192 + 100);
      expect((error as Error).message).not.toContain("secret");
    }
  });
});
