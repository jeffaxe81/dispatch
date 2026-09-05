# D-005 Backup and Restore Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-safe, encrypted and auditable backup/restore proof for the Dispatch database and referenced files, then validate it first with controlled adapters and later in disposable MySQL/TiDB and storage infrastructure.

**Architecture:** An operator-only TypeScript CLI coordinates small adapters for database and object storage, writes an encrypted recovery package with a versioned manifest, and refuses restore unless the destination is explicitly disposable. D-005A validates the entire flow with deterministic adapters; D-005B runs the same contracts against real non-production infrastructure. D-005C production activation is intentionally excluded and receives a separate plan after measurements.

**Tech Stack:** Node.js 24, TypeScript 5.9, `tsx`, Vitest 2, Zod 4, `mysql2`, native Node `crypto`, `fs/promises`, Forge presigned storage API, pnpm 10.4.1.

**Spec:** `docs/superpowers/specs/2026-08-30-backup-restore-proof-design.md`

## Global Constraints

- Base is version `1.15.4` at `checkpoint/d004-v1.15.4`.
- Work only on `chore/backup-restore-proof`; do not merge or deploy automatically.
- D-005A accepts only `synthetic` and `non-production` sources; it rejects production.
- Restore accepts only a separate database whose name starts with `dispatch_recovery_`.
- Restore requires `RECOVERY_TARGET_CLASS=disposable` and the exact confirmation phrase defined in Task 1.
- No task drops a database, bucket, table or production record.
- Database and storage credentials exist only in environment variables and never appear in arguments, logs, reports, commits or Pull Requests.
- Backup artifacts remain outside Git; only sanitized evidence templates and reports may be committed.
- The provisional targets are RPO `1 hour` and RTO `2 hours`.
- Candidate version `1.15.5` is recorded only after D-005A passes all local quality gates.
- D-005 is called “recovery proven” only after D-005B passes against disposable real infrastructure.
- D-005C scheduling, retention activation and production execution are outside this plan.

## Planned File Structure

| Path | Responsibility |
|---|---|
| `server/recovery/types.ts` | Stable domain contracts shared by backup, restore and verification |
| `server/recovery/config.ts` | Environment parsing, secret validation and production guards |
| `server/recovery/crypto.ts` | Streaming AES-256-GCM encryption, decryption and SHA-256 |
| `server/recovery/manifest.ts` | Manifest schema, version fingerprint, atomic write and package validation |
| `server/recovery/databaseAdapter.ts` | MySQL/TiDB export, restore, counts, references and invariants |
| `server/recovery/storageAdapter.ts` | Forge download and isolated prefixed upload |
| `server/recovery/backup.ts` | Backup orchestration and fail-safe package publication |
| `server/recovery/restore.ts` | Restore orchestration and key remapping |
| `server/recovery/verifier.ts` | Database, object and invariant verification |
| `server/recovery/cli.ts` | Operator-only `backup`, `restore` and `verify` commands |
| `server/recovery/testing/memoryAdapters.ts` | Deterministic D-005A adapters used only by tests |
| `vitest.recovery.config.ts` | Real non-production D-005B suite selection |
| `vitest.recovery.global-setup.ts` | D-005B environment preflight |
| `docs/source-package/BACKUP_RESTORE_RUNBOOK.md` | Operator procedure and failure diagnosis |
| `docs/source-package/RECOVERY_DRILL_CHECKLIST.md` | Before/during/after exercise controls |
| `docs/source-package/RECOVERY_EVIDENCE_TEMPLATE.md` | Sanitized evidence report template |
| `docs/decisions/D005-backup-restore-proof.md` | Decision, risks, state and activation boundary |

---

### Task 1: Recovery contracts and safety configuration

**Files:**
- Create: `server/recovery/types.ts`
- Create: `server/recovery/config.ts`
- Test: `server/recovery/config.test.ts`

**Interfaces:**
- Consumes: environment variables supplied by the operator.
- Produces: `RecoveryConfig`, `RecoveryEnvelope`, `RecoveryManifest`, `RecoveryArtifact`, `StorageReference`, `StorageKeyMapping`, `DatabaseRecoveryAdapter`, and `StorageRecoveryAdapter`.

- [ ] **Step 1: Write the failing safety tests**

```ts
import { describe, expect, it } from "vitest";
import { readRecoveryConfig } from "./config";

const valid = {
  RECOVERY_SOURCE_CLASS: "non-production",
  DATABASE_URL: "mysql://source:secret@db.test/dispatch_source",
  BUILT_IN_FORGE_API_URL: "https://source-storage.test",
  BUILT_IN_FORGE_API_KEY: "source-key",
  RECOVERY_TARGET_CLASS: "disposable",
  RECOVERY_TARGET_DATABASE_URL:
    "mysql://target:secret@db.test/dispatch_recovery_d005",
  RECOVERY_TARGET_FORGE_API_URL: "https://target-storage.test",
  RECOVERY_TARGET_FORGE_API_KEY: "target-key",
  RECOVERY_TARGET_STORAGE_PREFIX: "recovery-drills/d005",
  RECOVERY_CONFIRM_RESTORE: "RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH",
  RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

describe("recovery safety configuration", () => {
  it("rejects a production source in D-005A", () => {
    expect(() =>
      readRecoveryConfig(
        { ...valid, RECOVERY_SOURCE_CLASS: "production" },
        "backup",
      ),
    ).toThrow("production sources are disabled until D-005C");
  });

  it("rejects a target without the recovery database prefix", () => {
    expect(() =>
      readRecoveryConfig(
        {
          ...valid,
          RECOVERY_TARGET_DATABASE_URL:
            "mysql://target:secret@db.test/dispatch",
        },
        "restore",
      ),
    ).toThrow("dispatch_recovery_");
  });

  it("restores with target-only least-privilege credentials", () => {
    const targetOnly = Object.fromEntries(
      Object.entries(valid).filter(
        ([name]) =>
          ![
            "DATABASE_URL",
            "BUILT_IN_FORGE_API_URL",
            "BUILT_IN_FORGE_API_KEY",
          ].includes(name),
      ),
    );
    expect(readRecoveryConfig(targetOnly, "restore").command).toBe("restore");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/config.test.ts`

Expected: FAIL because `./config` does not exist.

- [ ] **Step 3: Define the shared contracts**

```ts
export const RECOVERY_FORMAT_VERSION = 1 as const;

export type RecoverySourceClass = "synthetic" | "non-production";
export type StorageReferenceTable = "incident_evidence" | "user_profiles";

export interface StorageReference {
  table: StorageReferenceTable;
  rowId: number;
  column: "storage_key" | "avatar_storage_key";
  key: string;
  contentType: string;
  expectedByteSize: number | null;
}

export interface StorageKeyMapping {
  originalKey: string;
  restoredKey: string;
  references: StorageReference[];
}

export interface RecoveryArtifact {
  kind: "database" | "object";
  relativePath: string;
  logicalKey: string | null;
  contentType: string;
  byteSize: number;
  plaintextSha256: string;
  encryptedSha256: string;
  references: StorageReference[];
}

export interface RecoveryManifest {
  formatVersion: typeof RECOVERY_FORMAT_VERSION;
  id: string;
  createdAt: string;
  appVersion: string;
  schemaVersion: string;
  sourceClass: RecoverySourceClass;
  sourceLabel: string;
  status: "complete" | "invalid";
  tableCounts: Record<string, number>;
  artifacts: RecoveryArtifact[];
}

export interface RecoveryEnvelope {
  formatVersion: typeof RECOVERY_FORMAT_VERSION;
  id: string;
  createdAt: string;
  status: "complete" | "invalid";
  encryptedManifestPath: "manifest.json.enc";
  encryptedManifestSha256: string;
}

export interface RecoveryStorageConfig {
  apiUrl: string;
  apiKey: string;
  prefix: string;
}

export type RecoveryConfig =
  | {
      command: "backup";
      sourceClass: RecoverySourceClass;
      sourceDatabaseUrl: string;
      sourceStorage: RecoveryStorageConfig;
      encryptionKey: Buffer;
    }
  | {
      command: "restore" | "verify";
      targetDatabaseUrl: string;
      targetStorage: RecoveryStorageConfig;
      encryptionKey: Buffer;
    };

export interface RecoveryVerificationReport {
  runId: string;
  status: "approved" | "rejected";
  rpoMs: number;
  rtoMs: number;
  tableCounts: Record<string, number>;
  objectCount: number;
  failedChecks: string[];
}

export interface DatabaseRecoveryAdapter {
  exportTo(destination: string): Promise<void>;
  restoreFrom(source: string): Promise<void>;
  isEmpty(): Promise<boolean>;
  countCriticalTables(): Promise<Record<string, number>>;
  listStorageReferences(): Promise<StorageReference[]>;
  replaceStorageReferences(mappings: StorageKeyMapping[]): Promise<void>;
  verifyInvariants(): Promise<Record<string, number>>;
}

export interface StorageRecoveryAdapter {
  download(key: string, destination: string): Promise<void>;
  upload(
    originalKey: string,
    source: string,
    contentType: string,
  ): Promise<string>;
}
```

- [ ] **Step 4: Implement strict configuration parsing**

`readRecoveryConfig()` must decode a 32-byte Base64 encryption key, parse both database URLs without logging them, reject equal database URLs, reject equal storage keys, require target database prefix `dispatch_recovery_`, normalize the target prefix without `..`, and require the exact confirmation phrase `RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH` for restore configuration.

```ts
export const RESTORE_CONFIRMATION =
  "RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH" as const;

export function readRecoveryConfig(
  env: Record<string, string | undefined>,
  command: "backup" | "restore" | "verify",
): RecoveryConfig {
  const encryptionKey = readEncryptionKey(env.RECOVERY_ENCRYPTION_KEY);
  if (command === "backup") {
    const sourceClass = required(env, "RECOVERY_SOURCE_CLASS");
    if (sourceClass === "production") {
      throw new Error("production sources are disabled until D-005C");
    }
    if (sourceClass !== "synthetic" && sourceClass !== "non-production") {
      throw new Error(
        "RECOVERY_SOURCE_CLASS must be synthetic or non-production",
      );
    }
    return {
      command,
      sourceClass,
      sourceDatabaseUrl: required(env, "DATABASE_URL"),
      sourceStorage: {
        apiUrl: required(env, "BUILT_IN_FORGE_API_URL"),
        apiKey: required(env, "BUILT_IN_FORGE_API_KEY"),
        prefix: "",
      },
      encryptionKey,
    };
  }
  const target = new URL(required(env, "RECOVERY_TARGET_DATABASE_URL"));
  const databaseName = target.pathname.replace(/^\//, "");
  if (!databaseName.startsWith("dispatch_recovery_")) {
    throw new Error("target database must start with dispatch_recovery_");
  }
  if (required(env, "RECOVERY_TARGET_CLASS") !== "disposable") {
    throw new Error("RECOVERY_TARGET_CLASS must be disposable");
  }
  if (required(env, "RECOVERY_CONFIRM_RESTORE") !== RESTORE_CONFIRMATION) {
    throw new Error("restore confirmation does not match");
  }
  const targetStorage = {
    apiUrl: required(env, "RECOVERY_TARGET_FORGE_API_URL"),
    apiKey: required(env, "RECOVERY_TARGET_FORGE_API_KEY"),
    prefix: readSafePrefix(env.RECOVERY_TARGET_STORAGE_PREFIX),
  };
  return {
    command,
    targetDatabaseUrl: target.href,
    targetStorage,
    encryptionKey,
  };
}
```

Implement `required()`, `readEncryptionKey()` and `readSafePrefix()` immediately above `readRecoveryConfig()`. `readEncryptionKey()` accepts exactly 32 decoded bytes; `readSafePrefix()` rejects absolute paths, empty segments, `.` and `..`. Backup receives only source credentials; restore and verify receive only target credentials plus the encryption key.

- [ ] **Step 5: Run tests and typecheck**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/config.test.ts && corepack pnpm check`

Expected: PASS; no secret value appears in failure snapshots or stdout.

- [ ] **Step 6: Commit the safety boundary**

```bash
git add server/recovery/types.ts server/recovery/config.ts server/recovery/config.test.ts
git commit -m "feat: definir limites seguros da recuperação"
```

### Task 2: Encrypted artifacts and versioned manifest

**Files:**
- Create: `server/recovery/crypto.ts`
- Create: `server/recovery/manifest.ts`
- Test: `server/recovery/crypto.test.ts`
- Test: `server/recovery/manifest.test.ts`

**Interfaces:**
- Consumes: `RecoveryManifest`, a 32-byte key and filesystem paths.
- Produces: `encryptFile()`, `decryptFile()`, `sha256File()`, `artifactPathForKey()`, `readRecoveryVersionMetadata()`, `writeEncryptedManifestAtomic()` and `readAndValidateManifest()`.

- [ ] **Step 1: Write failing encryption and corruption tests**

```ts
it("encrypts, authenticates and restores the exact bytes", async () => {
  await writeFile(source, Buffer.from("evidência sintética"));
  const encrypted = await encryptFile(source, cipher, key);
  await decryptFile(cipher, restored, key);
  expect(await readFile(restored)).toEqual(await readFile(source));
  expect(encrypted.plaintextSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(encrypted.encryptedSha256).toMatch(/^[a-f0-9]{64}$/);
});

it("rejects a modified encrypted artifact", async () => {
  await encryptFile(source, cipher, key);
  await appendFile(cipher, Buffer.from([0xff]));
  await expect(decryptFile(cipher, restored, key)).rejects.toThrow(
    "artifact authentication failed",
  );
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/crypto.test.ts server/recovery/manifest.test.ts`

Expected: FAIL because encryption and manifest modules do not exist.

- [ ] **Step 3: Implement AES-256-GCM streaming format**

Use a fixed eight-byte magic header `AXED0051`, a 12-byte random IV, encrypted bytes and a final 16-byte authentication tag. Hash plaintext while reading and hash the complete encrypted file after atomic close. Write to `<destination>.partial`, then rename.

```ts
export interface EncryptedFileResult {
  plaintextSha256: string;
  encryptedSha256: string;
  byteSize: number;
}

export async function encryptFile(
  source: string,
  destination: string,
  key: Buffer,
): Promise<EncryptedFileResult>;

export async function decryptFile(
  source: string,
  destination: string,
  key: Buffer,
): Promise<{ plaintextSha256: string; byteSize: number }>;

export async function sha256File(path: string): Promise<string>;
```

Never buffer an entire database export in memory. On authentication failure, remove only the `.partial` plaintext created by the current invocation.

- [ ] **Step 4: Implement and validate the manifest schema**

Use Zod strict objects. Keep only a non-sensitive `recovery-envelope.json` in plaintext. Encrypt the full manifest because logical object keys can contain identifying filenames. Reject unknown top-level keys, absolute artifact paths, `..`, duplicate logical keys, duplicate relative paths, non-hex hashes and any status other than `complete` during restore.

```ts
export function artifactPathForKey(key: string): string {
  return `artifacts/objects/${createHash("sha256").update(key).digest("hex")}.enc`;
}

export async function writeEncryptedManifestAtomic(
  packageRoot: string,
  manifest: RecoveryManifest,
  key: Buffer,
): Promise<void>;

export async function readAndValidateManifest(
  packageRoot: string,
  key: Buffer,
): Promise<RecoveryManifest>;

export async function readRecoveryVersionMetadata(
  projectRoot: string,
): Promise<{ appVersion: string; schemaVersion: string }>;
```

`writeEncryptedManifestAtomic()` writes `manifest.json.enc`, calculates its encrypted SHA-256 and atomically publishes `recovery-envelope.json`. The envelope contains only format version, run ID, UTC timestamp, status, encrypted manifest path and hash; it contains no source label, object key, table count or credential.

`readRecoveryVersionMetadata()` reads `package.json` and `drizzle/meta/_journal.json`. It returns the application version and a schema fingerprint in the exact form `<last migration tag>:<first 12 hex characters of the journal SHA-256>`.

- [ ] **Step 5: Run focused tests and full local suite**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/crypto.test.ts server/recovery/manifest.test.ts && corepack pnpm test`

Expected: new tests and all existing local tests PASS.

- [ ] **Step 6: Commit package integrity**

```bash
git add server/recovery/crypto.ts server/recovery/crypto.test.ts server/recovery/manifest.ts server/recovery/manifest.test.ts
git commit -m "feat: proteger pacote e manifesto de recuperação"
```

### Task 3: MySQL/TiDB database adapter and reference inventory

**Files:**
- Create: `server/recovery/databaseAdapter.ts`
- Test: `server/recovery/databaseAdapter.test.ts`

**Interfaces:**
- Consumes: one parsed database URL and injected `spawn`/`mysql2` dependencies.
- Produces: `MysqlCliRecoveryAdapter` implementing `DatabaseRecoveryAdapter`.

- [ ] **Step 1: Write failing command and SQL tests**

```ts
it("passes the password only through MYSQL_PWD", async () => {
  await adapter.exportTo("/safe/database.sql");
  expect(spawnMock).toHaveBeenCalledWith(
    "mysqldump",
    expect.arrayContaining([
      "--single-transaction",
      "--skip-lock-tables",
      "--no-tablespaces",
      "dispatch_source",
    ]),
    expect.objectContaining({ env: expect.objectContaining({ MYSQL_PWD: "secret" }) }),
  );
  expect(JSON.stringify(spawnMock.mock.calls)).not.toContain("--password=secret");
});

it("never drops or creates the target database", async () => {
  await adapter.restoreFrom("/safe/database.sql");
  const call = JSON.stringify(spawnMock.mock.calls);
  expect(call).not.toMatch(/DROP|CREATE DATABASE|mysqladmin/i);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts`

Expected: FAIL because `MysqlCliRecoveryAdapter` does not exist.

- [ ] **Step 3: Implement safe native process execution**

Use `spawn()` with `shell: false`, fixed binaries `mysqldump` and `mysql`, password only in child `MYSQL_PWD`, stdout redirected to a file for export and file input piped to stdin for restore. Capture at most 8 KiB of sanitized stderr and convert non-zero exit into a typed failure.

The child environment contains only required process variables such as `PATH`, locale and `MYSQL_PWD`; it does not inherit Forge or recovery encryption credentials.

```ts
export interface MysqlCliRecoveryAdapterOptions {
  databaseUrl: string;
  spawnProcess?: typeof import("node:child_process").spawn;
  connectDatabase?: (
    databaseUrl: string,
  ) => Promise<import("mysql2/promise").Connection>;
}

export class MysqlCliRecoveryAdapter implements DatabaseRecoveryAdapter {
  constructor(options: MysqlCliRecoveryAdapterOptions);
  exportTo(destination: string): Promise<void>;
  restoreFrom(source: string): Promise<void>;
  isEmpty(): Promise<boolean>;
  countCriticalTables(): Promise<Record<string, number>>;
  listStorageReferences(): Promise<StorageReference[]>;
  replaceStorageReferences(mappings: StorageKeyMapping[]): Promise<void>;
  verifyInvariants(): Promise<Record<string, number>>;
}
```

- [ ] **Step 4: Implement only fixed inventory and invariant queries**

Critical counts: `users`, `user_profiles`, `teams`, `incidents`, `incident_assignments`, `incident_evidence`, `audit_logs`. `isEmpty()` queries `information_schema.tables` and returns true only when the target schema contains zero application base tables; the database itself must already exist.

Storage inventory reads `incident_evidence.storage_key`, `file_name`, `content_type`, `byte_size` and non-null `user_profiles.avatar_storage_key`, `avatar_content_type`. Invariants return numeric counts for orphan evidence, orphan assignments and broken profile-user links. `replaceStorageReferences()` uses a transaction and a `switch` over the two allowed tables; never interpolate a table or column supplied externally.

- [ ] **Step 5: Run tests, typecheck and security check**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/databaseAdapter.test.ts && corepack pnpm check && corepack pnpm security:check`

Expected: PASS with no database connection because process and SQL dependencies are injected.

- [ ] **Step 6: Commit the database boundary**

```bash
git add server/recovery/databaseAdapter.ts server/recovery/databaseAdapter.test.ts
git commit -m "feat: adicionar adaptador seguro de banco para recuperação"
```

### Task 4: Forge object storage adapter

**Files:**
- Create: `server/recovery/storageAdapter.ts`
- Test: `server/recovery/storageAdapter.test.ts`

**Interfaces:**
- Consumes: source or target Forge endpoint/key, target prefix, injected `fetch`.
- Produces: `ForgeRecoveryStorageAdapter` implementing `StorageRecoveryAdapter`.

- [ ] **Step 1: Write failing download, upload and sanitization tests**

```ts
it("uploads under the isolated recovery prefix", async () => {
  const restoredKey = await target.upload(
    "incident-evidence/9/photo.jpg",
    fixture,
    "image/jpeg",
  );
  expect(restoredKey).toBe(
    "recovery-drills/d005/incident-evidence/9/photo.jpg",
  );
  expect(presignUrl.searchParams.get("path")).toBe(restoredKey);
});

it("does not include signed URLs or response bodies in errors", async () => {
  fetchMock.mockResolvedValue(new Response("token=secret", { status: 503 }));
  await expect(source.download("evidence/a.jpg", fixture)).rejects.toThrow(
    "storage request failed (503)",
  );
  await expect(source.download("evidence/a.jpg", fixture)).rejects.not.toThrow(
    /token=secret|https:\/\//,
  );
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/storageAdapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement streamed Forge download and upload**

Generate presigned URLs with the same `v1/storage/presign/get` and `v1/storage/presign/put` contracts already used by `server/storage.ts`. Stream response bodies to/from files, use `AbortSignal.timeout(30_000)`, normalize keys, reject traversal, and return only the logical restored key.

```ts
export interface ForgeRecoveryStorageAdapterOptions {
  apiUrl: string;
  apiKey: string;
  targetPrefix: string;
  fetchImpl?: typeof fetch;
}

export class ForgeRecoveryStorageAdapter implements StorageRecoveryAdapter {
  constructor(options: ForgeRecoveryStorageAdapterOptions);
  download(key: string, destination: string): Promise<void>;
  upload(
    originalKey: string,
    source: string,
    contentType: string,
  ): Promise<string>;
}
```

Uploads always prepend `RECOVERY_TARGET_STORAGE_PREFIX`; the initial release never overwrites an original production key and exposes no delete method.

- [ ] **Step 4: Run tests and the existing storage regression tests**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/storageAdapter.test.ts server/storage.test.ts server/storageProxy.test.ts`

Expected: all selected tests PASS and existing storage contracts remain unchanged.

- [ ] **Step 5: Commit the storage boundary**

```bash
git add server/recovery/storageAdapter.ts server/recovery/storageAdapter.test.ts
git commit -m "feat: adicionar adaptador isolado de arquivos de recuperação"
```

### Task 5: Fail-safe backup orchestration

**Files:**
- Create: `server/recovery/backup.ts`
- Test: `server/recovery/backup.test.ts`

**Interfaces:**
- Consumes: source adapters, encryption key, application/schema versions, output root and source label.
- Produces: `runBackup(options): Promise<{ packageRoot: string; manifest: RecoveryManifest }>`.

- [ ] **Step 1: Write failing complete and partial package tests**

```ts
it("publishes a complete package only after database and objects pass", async () => {
  const result = await runBackup(options);
  expect(result.manifest.status).toBe("complete");
  expect(result.manifest.artifacts.map(item => item.kind)).toEqual([
    "database",
    "object",
    "object",
  ]);
  expect(
    await pathExists(`${result.packageRoot}/recovery-envelope.json`),
  ).toBe(true);
  expect(await pathExists(`${result.packageRoot}/manifest.json.enc`)).toBe(
    true,
  );
  expect(await pathExists(`${result.packageRoot}.partial`)).toBe(false);
});

it("never publishes a complete manifest when an object is missing", async () => {
  storage.download.mockRejectedValue(new Error("missing object"));
  await expect(runBackup(options)).rejects.toThrow("backup incomplete");
  expect(await findCompleteManifest(outputRoot)).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/backup.test.ts`

Expected: FAIL because `runBackup()` does not exist.

- [ ] **Step 3: Implement the atomic backup pipeline**

Use an ID `d005-<UTC compact timestamp>-<8 hex chars>`. Work in `<id>.partial`, export the database, inventory referenced objects sorted by logical key, download each unique key once, encrypt every artifact, compare declared evidence byte sizes, create the encrypted strict manifest and public envelope, rename to `<id>`, then write a sanitized backup report.

```ts
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

export async function runBackup(
  options: RunBackupOptions,
): Promise<{ packageRoot: string; manifest: RecoveryManifest }>;
```

On failure, retain only an invalid sanitized report and encrypted artifacts for diagnosis. Remove plaintext temporary files created by the current run.

- [ ] **Step 4: Add secret leakage assertions**

Read every JSON and text output under the test package and assert it contains none of: source URL, target URL, Forge key, encryption key or presigned URL.

- [ ] **Step 5: Run focused and full local tests**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/backup.test.ts && corepack pnpm test`

Expected: all tests PASS without external infrastructure.

- [ ] **Step 6: Commit backup orchestration**

```bash
git add server/recovery/backup.ts server/recovery/backup.test.ts
git commit -m "feat: orquestrar backup verificável e atômico"
```

### Task 6: Guarded restore and independent verifier

**Files:**
- Create: `server/recovery/restore.ts`
- Create: `server/recovery/verifier.ts`
- Test: `server/recovery/restore.test.ts`
- Test: `server/recovery/verifier.test.ts`

**Interfaces:**
- Consumes: validated package, target adapters, encryption key and safety configuration from Task 1.
- Produces: `runRestore()` and `verifyRestoredPackage()` with sanitized structured results.

- [ ] **Step 1: Write failing guard, remap and integrity tests**

```ts
it("refuses a non-empty target before restoring", async () => {
  targetDatabase.isEmpty.mockResolvedValue(false);
  await expect(runRestore(options)).rejects.toThrow(
    "target database must be empty",
  );
  expect(targetDatabase.restoreFrom).not.toHaveBeenCalled();
});

it("updates only restored references when storage keys change", async () => {
  targetStorage.upload.mockResolvedValue(
    "recovery-drills/d005/incident-evidence/1/photo.jpg",
  );
  await runRestore(options);
  expect(targetDatabase.replaceStorageReferences).toHaveBeenCalledWith([
    expect.objectContaining({
      originalKey: "incident-evidence/1/photo.jpg",
      restoredKey: "recovery-drills/d005/incident-evidence/1/photo.jpg",
    }),
  ]);
});

it("rejects a package before database restore when a hash differs", async () => {
  await corruptEncryptedArtifact(packageRoot);
  await expect(runRestore(options)).rejects.toThrow("artifact hash mismatch");
  expect(targetDatabase.restoreFrom).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/restore.test.ts server/recovery/verifier.test.ts`

Expected: FAIL because restore and verifier modules do not exist.

- [ ] **Step 3: Implement guarded restore**

The fixed order is: validate safety config, read strict manifest, verify encrypted hashes, require empty target, decrypt database to a temporary file, restore database, decrypt/upload objects under the target prefix, apply key mappings transactionally, remove plaintext temporary files, then call the verifier.

```ts
export interface RunRestoreOptions {
  packageRoot: string;
  targetDatabase: DatabaseRecoveryAdapter;
  targetStorage: StorageRecoveryAdapter;
  encryptionKey: Buffer;
  scratchRoot: string;
  recoveryReferenceTime: Date;
  now?: () => Date;
}

export interface VerifyRestoredPackageOptions {
  manifest: RecoveryManifest;
  targetDatabase: DatabaseRecoveryAdapter;
  targetStorage: StorageRecoveryAdapter;
  keyMappings: StorageKeyMapping[];
  scratchRoot: string;
  encryptionKey: Buffer;
  startedAt: Date;
  recoveryReferenceTime: Date;
  now?: () => Date;
}

export async function runRestore(
  options: RunRestoreOptions,
): Promise<RecoveryVerificationReport>;

export async function verifyRestoredPackage(
  options: VerifyRestoredPackageOptions,
): Promise<RecoveryVerificationReport>;
```

The code has no promotion, delete, drop, truncate or production connection path.

- [ ] **Step 4: Implement verification gates**

Require exact critical-table counts, zero invariant failures, one restored object per manifest logical key, successful redownload of each target object, matching plaintext hashes, and total duration below 7,200,000 ms for the RTO gate. Report RPO as measured metadata and fail if the recovered point is older than 3,600,000 ms relative to the exercise reference time.

- [ ] **Step 5: Run selected tests and all local tests**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/restore.test.ts server/recovery/verifier.test.ts && corepack pnpm test`

Expected: success, missing object, corrupted artifact, non-empty target, broken relation and timeout cases all behave deterministically.

- [ ] **Step 6: Commit restore and verification**

```bash
git add server/recovery/restore.ts server/recovery/restore.test.ts server/recovery/verifier.ts server/recovery/verifier.test.ts
git commit -m "feat: restaurar e verificar somente destino descartável"
```

### Task 7: Operator-only recovery CLI

**Files:**
- Create: `server/recovery/cli.ts`
- Test: `server/recovery/cli.test.ts`
- Modify: `package.json:6-23`
- Modify: `server/testSuiteConfig.test.ts`

**Interfaces:**
- Consumes: `backup`, `restore`, `verify` command plus explicit package/output arguments and protected environment.
- Produces: `pnpm recovery:backup`, `pnpm recovery:restore`, `pnpm recovery:verify`; exit `0` only on complete success.

- [ ] **Step 1: Write failing CLI contract tests**

```ts
it("offers only backup, restore and verify commands", async () => {
  expect(await runCli(["--help"], {})).toMatchObject({ code: 0 });
  expect((await runCli(["--help"], {})).stdout).toContain(
    "backup | restore | verify",
  );
  expect((await runCli(["delete"], {})).code).toBe(2);
});

it("prints a sanitized failure and returns non-zero", async () => {
  const result = await runCli(["restore", "--package", fixture], unsafeEnv);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("recovery failed:");
  expect(result.stderr).not.toMatch(/mysql:\/\/|secret|Bearer/i);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/cli.test.ts server/testSuiteConfig.test.ts`

Expected: FAIL because commands and scripts do not exist.

- [ ] **Step 3: Implement argument parsing and exit contracts**

Accepted forms:

```text
pnpm recovery:backup -- --output /absolute/safe/path --source-label homologacao
pnpm recovery:restore -- --package /absolute/safe/path/d005-...
pnpm recovery:verify -- --package /absolute/safe/path/d005-...
```

Reject relative paths, unknown flags, missing values and symlinked package roots. Print only run ID, stage, elapsed milliseconds and sanitized outcome. Write detailed sanitized JSON to `reports/`.

- [ ] **Step 4: Add package scripts and protect them with configuration tests**

```json
{
  "recovery:backup": "tsx server/recovery/cli.ts backup",
  "recovery:restore": "tsx server/recovery/cli.ts restore",
  "recovery:verify": "tsx server/recovery/cli.ts verify"
}
```

Extend `server/testSuiteConfig.test.ts` to assert exact scripts and to assert there is no `recovery:delete`, `recovery:production` or recovery command in `.github/workflows/quality.yml`.

- [ ] **Step 5: Run CLI, configuration and regression tests**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/cli.test.ts server/testSuiteConfig.test.ts && corepack pnpm check && corepack pnpm test`

Expected: all tests PASS; `--help` works without credentials; operational commands fail before side effects when configuration is incomplete.

- [ ] **Step 6: Commit the operator interface**

```bash
git add package.json server/testSuiteConfig.test.ts server/recovery/cli.ts server/recovery/cli.test.ts
git commit -m "feat: adicionar comandos administrativos de recuperação"
```

### Task 8: D-005A end-to-end proof with synthetic data

**Files:**
- Create: `server/recovery/testing/memoryAdapters.ts`
- Create: `server/recovery/recoveryDrill.test.ts`

**Interfaces:**
- Consumes: the same adapter contracts used by production-facing modules.
- Produces: deterministic source/target fixtures proving backup, destruction of the in-memory target, restore and validation without external infrastructure.

- [ ] **Step 1: Write the failing complete drill**

```ts
it("backs up, clears the disposable target, restores and verifies", async () => {
  const source = createSyntheticRecoverySource({
    users: 1,
    profiles: 1,
    teams: 1,
    incidents: 1,
    assignments: 1,
    evidence: Buffer.from("synthetic evidence"),
    auditLogs: 2,
  });
  const target = createEmptyRecoveryTarget();

  const backup = await runBackup({ ...baseBackupOptions, ...source });
  target.clearDisposableData();
  const report = await runRestore({
    ...baseRestoreOptions,
    packageRoot: backup.packageRoot,
    ...target,
  });

  expect(report.status).toBe("approved");
  expect(report.failedChecks).toEqual([]);
  expect(target.snapshot()).toMatchRecoverySource(source.snapshot());
});
```

- [ ] **Step 2: Run the drill and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/recoveryDrill.test.ts`

Expected: FAIL because the controlled adapters do not exist.

- [ ] **Step 3: Implement focused memory adapters**

The database adapter stores only the seven critical table counts, fixed storage references and invariant counts. The storage adapter stores `Map<string, Buffer>`, prefixes restored keys and has `clearDisposableData()` only in this testing module. It must not import application database code or expose a production delete method.

- [ ] **Step 4: Add deliberate failure drills**

Add cases for a missing evidence object, changed encrypted byte, wrong encryption key, broken assignment relation, incomplete manifest and target that is not empty. Every case must fail with a sanitized stage and non-zero logical result.

- [ ] **Step 5: Run D-005A and all quality gates available locally**

Run: `corepack pnpm test && corepack pnpm check && corepack pnpm security:check && corepack pnpm build`

Expected: D-005A drill and all existing tests PASS; build keeps only known analytics/bundle warnings.

- [ ] **Step 6: Commit the controlled proof**

```bash
git add server/recovery/testing/memoryAdapters.ts server/recovery/recoveryDrill.test.ts
git commit -m "test: provar recuperação completa com dados sintéticos"
```

### Task 9: D-005B real-infrastructure test harness

**Files:**
- Create: `vitest.recovery.config.ts`
- Create: `vitest.recovery.global-setup.ts`
- Create: `server/recovery/recoveryEnvironment.ts`
- Create: `server/recovery/recoveryEnvironment.test.ts`
- Create: `server/recovery/recoveryDrill.recovery.integration.test.ts`
- Modify: `package.json:6-26`
- Modify: `server/testSuiteConfig.test.ts`

**Interfaces:**
- Consumes: disposable MySQL/TiDB source and target, separate source/target Forge credentials, encryption key and installed `mysqldump`/`mysql` binaries.
- Produces: `pnpm test:recovery`, a separately gated real D-005B drill.

- [ ] **Step 1: Write failing preflight tests**

```ts
const completeRecoveryEnvironment = {
  RECOVERY_SOURCE_CLASS: "non-production",
  DATABASE_URL: "mysql://source:fake@db.test/dispatch_source",
  BUILT_IN_FORGE_API_URL: "https://source-storage.test",
  BUILT_IN_FORGE_API_KEY: "source-fake-key",
  RECOVERY_TARGET_CLASS: "disposable",
  RECOVERY_TARGET_DATABASE_URL:
    "mysql://target:fake@db.test/dispatch_recovery_d005",
  RECOVERY_TARGET_FORGE_API_URL: "https://target-storage.test",
  RECOVERY_TARGET_FORGE_API_KEY: "target-fake-key",
  RECOVERY_TARGET_STORAGE_PREFIX: "recovery-drills/d005",
  RECOVERY_CONFIRM_RESTORE: "RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH",
  RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
};

it("lists every missing recovery variable without its value", () => {
  expect(() => validateRecoveryEnvironment({})).toThrow(
    "Recovery drill requires: RECOVERY_SOURCE_CLASS, DATABASE_URL, " +
      "BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY, " +
      "RECOVERY_TARGET_CLASS, RECOVERY_TARGET_DATABASE_URL, " +
      "RECOVERY_TARGET_FORGE_API_URL, RECOVERY_TARGET_FORGE_API_KEY, " +
      "RECOVERY_TARGET_STORAGE_PREFIX, RECOVERY_CONFIRM_RESTORE, " +
      "RECOVERY_ENCRYPTION_KEY",
  );
});

it("rejects unavailable native clients before test collection", async () => {
  await expect(validateRecoveryBinaries({ which: async () => false })).rejects.toThrow(
    "mysqldump and mysql are required",
  );
});

it("rejects equal source and target storage credentials", () => {
  expect(() =>
    validateRecoveryEnvironment({
      ...completeRecoveryEnvironment,
      RECOVERY_TARGET_FORGE_API_KEY:
        completeRecoveryEnvironment.BUILT_IN_FORGE_API_KEY,
    }),
  ).toThrow("source and target storage credentials must differ");
});
```

- [ ] **Step 2: Run preflight tests and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/recoveryEnvironment.test.ts`

Expected: FAIL because the preflight module does not exist.

- [ ] **Step 3: Implement the separate recovery suite**

`vitest.recovery.config.ts` includes only `server/recovery/**/*.recovery.integration.test.ts` and uses `vitest.recovery.global-setup.ts`. Global setup validates every variable, checks source/target separation, confirms the target database prefix, and checks `mysqldump`/`mysql` availability before test collection.

```json
{
  "test:recovery": "vitest run --config vitest.recovery.config.ts"
}
```

Do not add this command to `test`, `test:unit`, `test:integration`, `test:all` or the GitHub quality workflow.

- [ ] **Step 4: Implement the real drill test without destructive helpers**

The test requires a pre-provisioned, migrated, synthetic-only source and an existing but table-free `dispatch_recovery_*` target database. It uploads a uniquely named avatar and evidence to source storage, inserts one linked operational path, runs backup and restore, then calls the verifier. It does not create/drop databases, truncate tables or delete storage objects.

```ts
it("restores database and referenced files in disposable infrastructure", async () => {
  const fixture = await seedUniqueSyntheticFixture(sourceDatabase, sourceStorage);
  const backup = await runBackup(realBackupOptions(fixture));
  const report = await runRestore(realRestoreOptions(backup.packageRoot));
  expect(report.status).toBe("approved");
  expect(report.rtoMs).toBeLessThanOrEqual(7_200_000);
  expect(report.rpoMs).toBeLessThanOrEqual(3_600_000);
});
```

- [ ] **Step 5: Verify suite separation without real credentials**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recovery/recoveryEnvironment.test.ts server/testSuiteConfig.test.ts && corepack pnpm test:recovery`

Expected: local configuration tests PASS; `test:recovery` stops before collection and lists missing variable names plus missing binaries, without values.

- [ ] **Step 6: Commit the D-005B harness**

```bash
git add package.json server/testSuiteConfig.test.ts vitest.recovery.config.ts vitest.recovery.global-setup.ts server/recovery/recoveryEnvironment.ts server/recovery/recoveryEnvironment.test.ts server/recovery/recoveryDrill.recovery.integration.test.ts
git commit -m "test: preparar homologação real de recuperação"
```

### Task 10: Runbooks, decision history and candidate version

**Files:**
- Create: `docs/decisions/D005-backup-restore-proof.md`
- Create: `docs/source-package/BACKUP_RESTORE_RUNBOOK.md`
- Create: `docs/source-package/RECOVERY_DRILL_CHECKLIST.md`
- Create: `docs/source-package/RECOVERY_EVIDENCE_TEMPLATE.md`
- Modify: `docs/source-package/CHANGELOG.md:1-12`
- Modify: `package.json:3`
- Modify: `scripts/security-regression-check.mjs:9`
- Modify: `.gitignore`
- Test: `server/recoveryDocumentation.test.ts`

**Interfaces:**
- Consumes: implemented commands, safety phrases and measured D-005A results.
- Produces: operator instructions that distinguish automation, proof and production activation; candidate `1.15.5`.

- [ ] **Step 1: Write failing documentation contract tests**

```ts
it("documents the exact safety gates and does not claim production proof", () => {
  const runbook = read("docs/source-package/BACKUP_RESTORE_RUNBOOK.md");
  expect(runbook).toContain("RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH");
  expect(runbook).toContain("dispatch_recovery_");
  expect(runbook).toContain("pnpm test:recovery");
  expect(runbook).toContain("não comprovado em produção");
});

it("keeps backup artifacts out of Git", () => {
  const ignore = read(".gitignore");
  expect(ignore).toContain("recovery-packages/");
  expect(ignore).toContain("*.recovery.enc");
});
```

- [ ] **Step 2: Run documentation tests and confirm RED**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recoveryDocumentation.test.ts`

Expected: FAIL because runbooks and ignore rules do not exist.

- [ ] **Step 3: Write the four documents and ignore rules**

The runbook contains preflight, exact commands, expected output, rollback/diagnosis and explicit stop conditions. The checklist separates before/during/after. The evidence template records run ID, application/schema versions, source/target labels, counts, hashes, RPO, RTO, failures and human approval without credentials. The decision records D-005A as automation and D-005B as the proof gate. Add `recovery-packages/`, `*.recovery.enc`, `*.sql.enc` and `recovery-report.private.json` to `.gitignore`.

- [ ] **Step 4: Record candidate version only after D-005A passes**

Change `package.json` and the security regression expected version from `1.15.4` to `1.15.5`. Add changelog entry stating the exact D-005A test count, the real D-005B state, and that no production activation occurred. Never write “recovery proven” unless Task 12 has passed.

- [ ] **Step 5: Run documentation, security and full local validation**

Run: `corepack pnpm vitest run --config vitest.config.ts server/recoveryDocumentation.test.ts && corepack pnpm security:check && corepack pnpm check && corepack pnpm test && corepack pnpm build`

Expected: all commands PASS; changelog states D-005B truthfully.

- [ ] **Step 6: Commit documentation and candidate version**

```bash
git add .gitignore package.json scripts/security-regression-check.mjs docs/decisions/D005-backup-restore-proof.md docs/source-package/BACKUP_RESTORE_RUNBOOK.md docs/source-package/RECOVERY_DRILL_CHECKLIST.md docs/source-package/RECOVERY_EVIDENCE_TEMPLATE.md docs/source-package/CHANGELOG.md server/recoveryDocumentation.test.ts
git commit -m "docs: registrar checkpoint candidato 1.15.5"
```

### Task 11: D-005A verification, recoverable checkpoint and draft PR

**Files:**
- Modify only if evidence requires correction: `docs/source-package/CHANGELOG.md`
- Create outside Git: `../dispatch-d005a-v1.15.5-checkpoint.bundle`

**Interfaces:**
- Consumes: all D-005A commits and quality commands.
- Produces: verified local checkpoint, SHA-256 evidence and draft Pull Request; no merge/deploy.

- [ ] **Step 1: Confirm a clean frozen installation**

Run: `corepack pnpm install --frozen-lockfile`

Expected: exit `0`, no lockfile modification and only authorized dependency build scripts.

- [ ] **Step 2: Run the complete infrastructure-independent gate**

Run: `corepack pnpm security:check && corepack pnpm check && corepack pnpm test && corepack pnpm build`

Expected: every command exits `0`; record exact test/file counts and only previously known build warnings.

- [ ] **Step 3: Prove the real suite blocks safely without infrastructure**

Run: `env -u DATABASE_URL -u BUILT_IN_FORGE_API_URL -u BUILT_IN_FORGE_API_KEY -u RECOVERY_TARGET_DATABASE_URL -u RECOVERY_TARGET_FORGE_API_URL -u RECOVERY_TARGET_FORGE_API_KEY -u RECOVERY_ENCRYPTION_KEY corepack pnpm test:recovery`

Expected: non-zero before test collection, listing variable names only and performing no network or filesystem package write.

- [ ] **Step 4: Inspect the complete diff and secret scan**

Run: `git diff checkpoint/d005-pre-design...HEAD --check && git diff --stat checkpoint/d005-pre-design...HEAD && git grep -nE 'gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|RECOVERY_ENCRYPTION_KEY=[A-Za-z0-9+/=]{20,}|BUILT_IN_FORGE_API_KEY=[A-Za-z0-9._-]{16,}' -- ':!docs/superpowers/plans/*'`

Expected: diff check passes; secret scan returns no matches. Inspect every changed file before continuing.

- [ ] **Step 5: Record exact measured evidence before tagging**

Update the candidate changelog only if the final test/file count or observed warnings differ from Task 10, then commit the correction.

```bash
git add docs/source-package/CHANGELOG.md
git commit -m "docs: registrar validação do D-005A"
```

Skip the commit when the changelog already contains the exact measured evidence.

- [ ] **Step 6: Re-run the gates after any evidence correction**

Run: `corepack pnpm security:check && corepack pnpm check && corepack pnpm test && corepack pnpm build && git status --short`

Expected: all commands pass and the worktree is clean.

- [ ] **Step 7: Create and verify the D-005A checkpoint**

```bash
git tag -a checkpoint/d005a-v1.15.5 -m "D-005A automação de recuperação validada"
git bundle create ../dispatch-d005a-v1.15.5-checkpoint.bundle chore/backup-restore-proof checkpoint/d005a-v1.15.5 checkpoint/d005-pre-design
git bundle verify ../dispatch-d005a-v1.15.5-checkpoint.bundle
sha256sum ../dispatch-d005a-v1.15.5-checkpoint.bundle
```

Expected: bundle records complete history and its SHA-256 is copied to the delivery report.

- [ ] **Step 8: Publish only branch/checkpoint and open a draft PR**

Push `chore/backup-restore-proof` and `checkpoint/d005a-v1.15.5` through the authorized GitHub connection. Open a draft PR against `main` containing scope, safety boundaries, local evidence, D-005B dependency and rollback checkpoint. Do not merge, deploy or add recovery secrets to GitHub.

- [ ] **Step 9: Verify GitHub quality checks**

Expected: frozen install, security, TypeScript, local tests and build pass in the existing read-only workflow. The workflow must not run `test:recovery` because it has no disposable environment.

### Task 12: Execute the gated D-005B recovery drill

**Files:**
- Create from template after the exercise: `docs/source-package/RECOVERY_EVIDENCE_D005B_v1.15.5.md`
- Modify: `docs/decisions/D005-backup-restore-proof.md`
- Modify: `docs/source-package/CHANGELOG.md`

**Interfaces:**
- Consumes: infrastructure supplied through protected environment variables and the approved D-005A checkpoint.
- Produces: measured non-production proof or an explicit blocked/failed status; never a silent partial success.

- [ ] **Step 1: Obtain explicit infrastructure authorization**

The responsible operator must confirm all five statements before credentials are configured: source is synthetic-only, target database starts with `dispatch_recovery_`, target is disposable, storage credentials differ, and deletion/recreation is limited to provider-authorized temporary resources. Stop if any statement is false.

- [ ] **Step 2: Configure credentials outside conversation and Git**

Set protected variables in the authorized runner or local secure environment. Do not paste their values into a terminal transcript that will be committed. Set `RECOVERY_SOURCE_CLASS=non-production`, `RECOVERY_TARGET_CLASS=disposable` and `RECOVERY_CONFIRM_RESTORE=RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH`.

- [ ] **Step 3: Run preflight and the real drill**

Run: `corepack pnpm test:recovery`

Expected: backup, target-empty check, restore, object remap and verification pass. The test reports run ID, table/object counts, RPO and RTO without secrets. If preflight or any stage fails, stop; do not rerun until the cause is understood.

- [ ] **Step 4: Validate the restored application read-only**

Against the isolated restored environment, confirm login with a synthetic account, open the synthetic occurrence, inspect its assignment and audit history, and download the restored avatar/evidence. Do not create or dispatch a real occurrence.

- [ ] **Step 5: Complete the sanitized evidence report**

Copy `RECOVERY_EVIDENCE_TEMPLATE.md` to `RECOVERY_EVIDENCE_D005B_v1.15.5.md`. Record only logical environment labels, versions, counts, SHA-256 values, durations, pass/fail and responsible approval. Exclude hostnames, database URLs, storage keys that contain personal context, tokens and signed URLs.

- [ ] **Step 6: Record the truthful result**

If every automated and read-only check passes, update decision and changelog to “D-005B recovery proven in disposable non-production infrastructure”. Otherwise record “D-005B blocked” or “D-005B failed”, the sanitized reason and the next safe action. Do not create the final D-005 tag on blocked/failed results.

- [ ] **Step 7: Create final proof checkpoint only on success**

```bash
git add docs/source-package/RECOVERY_EVIDENCE_D005B_v1.15.5.md docs/decisions/D005-backup-restore-proof.md docs/source-package/CHANGELOG.md
git commit -m "docs: registrar prova real de recuperação D-005B"
git tag -a checkpoint/d005b-v1.15.5 -m "D-005B recuperação comprovada em ambiente descartável"
```

- [ ] **Step 8: Stop before D-005C**

Present measured volume, cost, RPO, RTO, provider snapshot/versioning capabilities and retention recommendation for a new approval. Production scheduling and activation require a separate D-005C design and implementation plan.

## Specification Coverage

| Approved specification area | Implemented or verified by |
|---|---|
| Architecture and isolated administrative boundary | Tasks 1, 3, 4 and 7 |
| Encrypted package, versioned manifest and hashes | Task 2 |
| Database plus referenced-file backup flow | Tasks 3, 4 and 5 |
| Guarded restore, remapping and safe failures | Task 6 |
| Credentials, sanitization and production protection | Tasks 1 through 7 and Task 11 |
| Synthetic D-005A proof | Task 8 |
| Real disposable D-005B proof and RPO/RTO | Tasks 9 and 12 |
| Retention recommendation and D-005C boundary | Tasks 10 and 12 |
| Runbooks, evidence, changelog and decisions | Task 10 |
| Version, bundle, checkpoint and draft Pull Request | Task 11 |

## Completion Summary Required

At the end of D-005A and again after D-005B, report:

1. what was built;
2. what the user learned;
3. decisions made;
4. files and contracts changed;
5. exact tests and results;
6. checkpoints, commits, bundle SHA-256 and Pull Request;
7. risks and observed failures;
8. external dependencies still missing;
9. what remains for D-005C;
10. the next milestone in the 18-item master backlog.
