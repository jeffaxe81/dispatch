import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyRestoredPackage } from "./verifier";
import type {
  DatabaseRecoveryAdapter,
  RecoveryManifest,
  StorageKeyMapping,
  StorageRecoveryAdapter,
} from "./types";

const restoredBytes = Buffer.from("verified object bytes");
const logicalKey = "incident-evidence/9/photo.jpg";
const restoredKey = `recovery-drills/d005/${logicalKey}`;

const manifest: RecoveryManifest = {
  formatVersion: 1,
  id: "d005-verifier-test",
  createdAt: "2026-08-30T08:00:00.000Z",
  appVersion: "1.15.4",
  schemaVersion: "0002_aromatic_warhawk:123456789abc",
  sourceClass: "synthetic",
  sourceLabel: "controlled source",
  status: "complete",
  tableCounts: { users: 1, incidents: 1, incident_evidence: 1 },
  artifacts: [
    {
      kind: "database",
      relativePath: "artifacts/database.sql.enc",
      logicalKey: null,
      contentType: "application/sql",
      byteSize: 10,
      plaintextSha256: "a".repeat(64),
      encryptedSha256: "b".repeat(64),
      references: [],
    },
    {
      kind: "object",
      relativePath: `artifacts/objects/${"c".repeat(64)}.enc`,
      logicalKey,
      contentType: "image/jpeg",
      byteSize: restoredBytes.byteLength,
      plaintextSha256: createHash("sha256").update(restoredBytes).digest("hex"),
      encryptedSha256: "d".repeat(64),
      references: [],
    },
  ],
};

const mappings: StorageKeyMapping[] = [
  { originalKey: logicalKey, restoredKey, references: [] },
];

describe("verifyRestoredPackage", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-recovery-verifier-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function database(
    invariants = { orphanEvidence: 0, orphanAssignments: 0 }
  ): DatabaseRecoveryAdapter {
    return {
      exportTo: async () => undefined,
      restoreFrom: async () => undefined,
      isEmpty: async () => false,
      countCriticalTables: async () => ({
        users: 1,
        incidents: 1,
        incident_evidence: 1,
      }),
      listStorageReferences: async () => [],
      replaceStorageReferences: async () => undefined,
      verifyInvariants: async () => invariants,
    };
  }

  function storage(available = true): StorageRecoveryAdapter {
    return {
      download: async (_key, destination) => {
        if (!available) {
          throw new Error("https://signed.test/token=storage-secret");
        }
        await writeFile(destination, restoredBytes);
      },
      upload: async key => key,
    };
  }

  function verify(
    overrides: Partial<Parameters<typeof verifyRestoredPackage>[0]> = {}
  ) {
    return verifyRestoredPackage({
      manifest,
      targetDatabase: database(),
      targetStorage: storage(),
      keyMappings: mappings,
      scratchRoot: root,
      encryptionKey: Buffer.alloc(32, 0x6b),
      startedAt: new Date("2026-08-30T08:20:00.000Z"),
      recoveryReferenceTime: new Date("2026-08-30T08:20:00.000Z"),
      now: () => new Date("2026-08-30T08:21:00.000Z"),
      ...overrides,
    });
  }

  it("approves exact counts, zero invariants and matching restored bytes", async () => {
    await expect(verify()).resolves.toEqual({
      runId: manifest.id,
      status: "approved",
      rpoMs: 1_200_000,
      rtoMs: 60_000,
      tableCounts: manifest.tableCounts,
      objectCount: 1,
      failedChecks: [],
    });
  });

  it("rejects broken relations without exposing object keys or storage errors", async () => {
    const report = await verify({
      targetDatabase: database({ orphanEvidence: 1, orphanAssignments: 0 }),
      targetStorage: storage(false),
    });

    expect(report.status).toBe("rejected");
    expect(report.failedChecks).toEqual([
      "database invariants failed",
      "restored object unavailable",
    ]);
    expect(JSON.stringify(report)).not.toMatch(
      /incident-evidence|signed\.test|storage-secret/
    );
  });

  it("rejects recovery points and durations outside the provisional objectives", async () => {
    const report = await verify({
      recoveryReferenceTime: new Date("2026-08-30T10:00:00.001Z"),
      now: () => new Date("2026-08-30T10:20:00.001Z"),
    });

    expect(report.status).toBe("rejected");
    expect(report.rpoMs).toBe(7_200_001);
    expect(report.rtoMs).toBe(7_200_001);
    expect(report.failedChecks).toEqual([
      "RPO exceeds 3600000 ms",
      "RTO exceeds 7200000 ms",
    ]);
  });
});
