import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runBackup } from "./backup";
import { runRestore } from "./restore";
import {
  createEmptyRecoveryTarget,
  createSyntheticRecoverySource,
} from "./testing/memoryAdapters";

const encryptionKey = Buffer.alloc(32, 0x7c);
const backupTime = new Date("2026-08-30T08:00:00.000Z");

describe("D-005A controlled recovery drill", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-d005a-drill-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function source() {
    return createSyntheticRecoverySource({
      users: 1,
      profiles: 1,
      teams: 1,
      incidents: 1,
      assignments: 1,
      evidence: Buffer.from("synthetic evidence"),
      auditLogs: 2,
    });
  }

  async function backup(currentSource = source()) {
    return {
      currentSource,
      result: await runBackup({
        database: currentSource.database,
        storage: currentSource.storage,
        encryptionKey,
        outputRoot: join(root, "packages"),
        appVersion: "1.15.4",
        schemaVersion: "0002_aromatic_warhawk:123456789abc",
        sourceClass: "synthetic",
        sourceLabel: "D-005A controlled drill",
        now: () => backupTime,
        randomBytes: () => Buffer.from([9, 10, 11, 12]),
      }),
    };
  }

  function restoreClock() {
    const values = [
      new Date("2026-08-30T08:20:00.000Z"),
      new Date("2026-08-30T08:21:00.000Z"),
    ];
    return () => values.shift() ?? new Date("2026-08-30T08:21:00.000Z");
  }

  function restoreOptions(
    packageRoot: string,
    target = createEmptyRecoveryTarget(),
    key = encryptionKey
  ) {
    return {
      target,
      options: {
        packageRoot,
        targetDatabase: target.database,
        targetStorage: target.storage,
        encryptionKey: key,
        scratchRoot: join(root, "scratch"),
        recoveryReferenceTime: new Date("2026-08-30T08:20:00.000Z"),
        now: restoreClock(),
      },
    };
  }

  it("backs up, clears the disposable target, restores and verifies", async () => {
    const { currentSource, result } = await backup();
    const { target, options } = restoreOptions(result.packageRoot);
    target.clearDisposableData();

    const report = await runRestore(options);

    expect(report.status).toBe("approved");
    expect(report.failedChecks).toEqual([]);
    expect(target.snapshot()).toEqual(currentSource.snapshot());
  });

  it("rejects a missing source object without publishing a package", async () => {
    const currentSource = source();
    currentSource.deleteObject("incident-evidence/1/evidence.bin");

    await expect(backup(currentSource)).rejects.toThrow("backup incomplete");
  });

  it("rejects changed encrypted bytes and a wrong encryption key", async () => {
    const corrupted = await backup();
    const objectArtifact = corrupted.result.manifest.artifacts.find(
      artifact => artifact.kind === "object"
    )!;
    await appendFile(
      join(corrupted.result.packageRoot, objectArtifact.relativePath),
      Buffer.from([0xff])
    );
    const corruptedRestore = restoreOptions(corrupted.result.packageRoot);

    await expect(runRestore(corruptedRestore.options)).rejects.toThrow(
      "artifact hash mismatch"
    );

    await rm(join(root, "packages"), { recursive: true, force: true });
    const wrongKey = await backup();
    const wrongKeyRestore = restoreOptions(
      wrongKey.result.packageRoot,
      createEmptyRecoveryTarget(),
      Buffer.alloc(32, 0x11)
    );
    await expect(runRestore(wrongKeyRestore.options)).rejects.toThrow(
      "artifact authentication failed"
    );
  });

  it("rejects a broken relation and a target that is not empty", async () => {
    const saved = await backup();
    const brokenTarget = createEmptyRecoveryTarget();
    brokenTarget.setInvariantOverride("orphanAssignments", 1);
    const broken = restoreOptions(saved.result.packageRoot, brokenTarget);

    const brokenReport = await runRestore(broken.options);
    expect(brokenReport.status).toBe("rejected");
    expect(brokenReport.failedChecks).toContain("database invariants failed");

    const nonEmptyTarget = createEmptyRecoveryTarget();
    nonEmptyTarget.seedNonEmpty();
    const nonEmpty = restoreOptions(saved.result.packageRoot, nonEmptyTarget);
    await expect(runRestore(nonEmpty.options)).rejects.toThrow(
      "target database must be empty"
    );
  });

  it("rejects an incomplete manifest before touching the target", async () => {
    const saved = await backup();
    const envelopePath = join(
      saved.result.packageRoot,
      "recovery-envelope.json"
    );
    const envelope = JSON.parse(await readFile(envelopePath, "utf8"));
    envelope.status = "invalid";
    await writeFile(envelopePath, JSON.stringify(envelope));
    const target = createEmptyRecoveryTarget();
    const restore = restoreOptions(saved.result.packageRoot, target);

    await expect(runRestore(restore.options)).rejects.toThrow(
      "manifest status must be complete"
    );
    expect(target.snapshot().tableCounts).toEqual({
      users: 0,
      user_profiles: 0,
      teams: 0,
      incidents: 0,
      incident_assignments: 0,
      incident_evidence: 0,
      audit_logs: 0,
    });
  });
});
