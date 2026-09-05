import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createConnection, type Connection } from "mysql2/promise";
import type {
  DatabaseRecoveryAdapter,
  StorageKeyMapping,
  StorageReference,
} from "./types";

const MAX_STDERR_BYTES = 8 * 1024;

const CRITICAL_TABLES = [
  "users",
  "user_profiles",
  "teams",
  "incidents",
  "incident_assignments",
  "incident_evidence",
  "audit_logs",
] as const;

type QueryRow = Record<string, unknown>;

export interface MysqlCliRecoveryAdapterOptions {
  databaseUrl: string;
  spawnProcess?: typeof spawn;
  connectDatabase?: (databaseUrl: string) => Promise<Connection>;
}

export class DatabaseRecoveryProcessError extends Error {
  readonly exitCode: number | null;

  constructor(
    binary: "mysqldump" | "mysql",
    exitCode: number | null,
    stderr: string
  ) {
    super(
      `${binary} failed${exitCode === null ? "" : ` with exit code ${exitCode}`}${
        stderr ? `: ${stderr}` : ""
      }`
    );
    this.name = "DatabaseRecoveryProcessError";
    this.exitCode = exitCode;
  }
}

export class MysqlCliRecoveryAdapter implements DatabaseRecoveryAdapter {
  private readonly databaseUrl: string;
  private readonly url: URL;
  private readonly spawnProcess: typeof spawn;
  private readonly connectDatabase: (
    databaseUrl: string
  ) => Promise<Connection>;

  constructor(options: MysqlCliRecoveryAdapterOptions) {
    try {
      this.url = new URL(options.databaseUrl);
    } catch {
      throw new Error("databaseUrl must be a valid MySQL URL");
    }
    if (this.url.protocol !== "mysql:") {
      throw new Error("databaseUrl must use the mysql protocol");
    }
    const databaseName = this.databaseName();
    if (
      !this.url.hostname ||
      !databaseName ||
      databaseName.length > 64 ||
      /[\u0000\r\n/]/.test(databaseName)
    ) {
      throw new Error("databaseUrl must include a safe database name");
    }
    this.databaseUrl = options.databaseUrl;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.connectDatabase = options.connectDatabase ?? createConnection;
  }

  async exportTo(destination: string): Promise<void> {
    const child = this.start("mysqldump", [
      "--no-defaults",
      "--no-login-paths",
      "--protocol=TCP",
      `--host=${this.url.hostname}`,
      `--port=${this.url.port || "3306"}`,
      `--user=${decodeURIComponent(this.url.username)}`,
      "--single-transaction",
      "--skip-lock-tables",
      "--no-tablespaces",
      "--",
      this.databaseName(),
    ]);
    await Promise.all([
      this.waitForExit(child, "mysqldump"),
      pipeline(child.stdout, createWriteStream(destination)),
    ]);
  }

  async restoreFrom(source: string): Promise<void> {
    const child = this.start("mysql", [
      "--no-defaults",
      "--no-login-paths",
      "--protocol=TCP",
      `--host=${this.url.hostname}`,
      `--port=${this.url.port || "3306"}`,
      `--user=${decodeURIComponent(this.url.username)}`,
      "--",
      this.databaseName(),
    ]);
    try {
      await Promise.all([
        this.waitForExit(child, "mysql"),
        pipeline(createReadStream(source), child.stdin),
      ]);
    } catch (error) {
      child.stdin.destroy();
      if (!child.killed) child.kill();
      throw error;
    }
  }

  async isEmpty(): Promise<boolean> {
    const count = await this.queryCount(
      "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
    );
    return count === 0;
  }

  async countCriticalTables(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of CRITICAL_TABLES) {
      counts[table] = await this.queryCount(
        `SELECT COUNT(*) AS count FROM ${table}`
      );
    }
    return counts;
  }

  async listStorageReferences(): Promise<StorageReference[]> {
    return this.withConnection(async connection => {
      const evidence = await this.queryRows(
        connection,
        "SELECT id, storage_key, file_name, content_type, byte_size FROM incident_evidence"
      );
      const profiles = await this.queryRows(
        connection,
        "SELECT id, avatar_storage_key, avatar_content_type FROM user_profiles WHERE avatar_storage_key IS NOT NULL"
      );
      return [
        ...evidence.map(row => ({
          table: "incident_evidence" as const,
          rowId: this.requiredNumber(row, "id"),
          column: "storage_key" as const,
          key: this.requiredString(row, "storage_key"),
          contentType: this.requiredString(row, "content_type"),
          expectedByteSize: this.requiredNumber(row, "byte_size"),
        })),
        ...profiles.map(row => ({
          table: "user_profiles" as const,
          rowId: this.requiredNumber(row, "id"),
          column: "avatar_storage_key" as const,
          key: this.requiredString(row, "avatar_storage_key"),
          contentType: this.requiredString(row, "avatar_content_type"),
          expectedByteSize: null,
        })),
      ];
    });
  }

  async replaceStorageReferences(mappings: StorageKeyMapping[]): Promise<void> {
    await this.withConnection(async connection => {
      await connection.beginTransaction();
      try {
        for (const mapping of mappings) {
          for (const reference of mapping.references) {
            switch (reference.table) {
              case "incident_evidence":
                await connection.query(
                  "UPDATE incident_evidence SET storage_key = ? WHERE id = ? AND storage_key = ?",
                  [mapping.restoredKey, reference.rowId, mapping.originalKey]
                );
                break;
              case "user_profiles":
                await connection.query(
                  "UPDATE user_profiles SET avatar_storage_key = ? WHERE id = ? AND avatar_storage_key = ?",
                  [mapping.restoredKey, reference.rowId, mapping.originalKey]
                );
                break;
            }
          }
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  async verifyInvariants(): Promise<Record<string, number>> {
    const [orphanEvidence, orphanAssignments, brokenProfileUserLinks] =
      await Promise.all([
        this.queryCount(
          "SELECT COUNT(*) AS count FROM incident_evidence AS evidence LEFT JOIN incidents AS incident ON incident.id = evidence.incident_id WHERE incident.id IS NULL"
        ),
        this.queryCount(
          "SELECT COUNT(*) AS count FROM incident_assignments AS assignment LEFT JOIN incidents AS incident ON incident.id = assignment.incident_id WHERE incident.id IS NULL"
        ),
        this.queryCount(
          "SELECT COUNT(*) AS count FROM user_profiles AS profile LEFT JOIN users AS user ON user.id = profile.user_id WHERE user.id IS NULL"
        ),
      ]);
    return { orphanEvidence, orphanAssignments, brokenProfileUserLinks };
  }

  private start(binary: "mysqldump" | "mysql", args: string[]) {
    const child = this.spawnProcess(binary, args, {
      shell: false,
      env: this.childEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error(`${binary} must expose standard streams`);
    }
    return child as typeof child & {
      stdin: NonNullable<typeof child.stdin>;
      stdout: NonNullable<typeof child.stdout>;
      stderr: NonNullable<typeof child.stderr>;
    };
  }

  private waitForExit(
    child: ReturnType<typeof this.start>,
    binary: "mysqldump" | "mysql"
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let stderr = Buffer.alloc(0);
      child.stderr.on("data", (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stderr = Buffer.concat(
          [
            stderr,
            data.subarray(0, Math.max(0, MAX_STDERR_BYTES - stderr.length)),
          ],
          Math.min(MAX_STDERR_BYTES, stderr.length + data.length)
        );
      });
      child.once("error", () => {
        reject(
          new DatabaseRecoveryProcessError(binary, null, "process failed")
        );
      });
      child.once("close", code => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new DatabaseRecoveryProcessError(
            binary,
            code,
            this.sanitizeStderr(stderr.toString("utf8"))
          )
        );
      });
    });
  }

  private childEnvironment(): NodeJS.ProcessEnv {
    const password = decodeURIComponent(this.url.password);
    const environment: NodeJS.ProcessEnv = { MYSQL_PWD: password };
    for (const name of ["PATH", "LANG", "LC_ALL", "LC_CTYPE"] as const) {
      const value = process.env[name];
      if (value !== undefined) environment[name] = value;
    }
    return environment;
  }

  private databaseName(): string {
    return decodeURIComponent(this.url.pathname.replace(/^\//, ""));
  }

  private async queryCount(sql: string): Promise<number> {
    return this.withConnection(async connection => {
      const rows = await this.queryRows(connection, sql);
      return this.requiredNumber(rows[0] ?? {}, "count");
    });
  }

  private async queryRows(
    connection: Connection,
    sql: string
  ): Promise<QueryRow[]> {
    const [rows] = await connection.query(sql);
    if (!Array.isArray(rows)) {
      throw new Error("database query did not return rows");
    }
    return rows as QueryRow[];
  }

  private async withConnection<T>(
    operation: (connection: Connection) => Promise<T>
  ): Promise<T> {
    const connection = await this.connectDatabase(this.databaseUrl);
    try {
      return await operation(connection);
    } finally {
      await connection.end();
    }
  }

  private requiredNumber(row: QueryRow, field: string): number {
    const value = Number(row[field]);
    if (!Number.isFinite(value)) {
      throw new Error(`database query returned an invalid ${field}`);
    }
    return value;
  }

  private requiredString(row: QueryRow, field: string): string {
    const value = row[field];
    if (typeof value !== "string") {
      throw new Error(`database query returned an invalid ${field}`);
    }
    return value;
  }

  private sanitizeStderr(stderr: string): string {
    const password = decodeURIComponent(this.url.password);
    let sanitized = stderr.slice(0, MAX_STDERR_BYTES);
    if (password) {
      sanitized = sanitized
        .replaceAll(password, "[REDACTED]")
        .replaceAll(this.url.password, "[REDACTED]");
    }
    return sanitized
      .replace(/(MYSQL_PWD|password)\s*=\s*[^\s]+/gi, "$1=[REDACTED]")
      .slice(0, MAX_STDERR_BYTES);
  }
}
