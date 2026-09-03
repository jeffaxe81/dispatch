import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { sha256File } from "./crypto";
import type {
  DatabaseRecoveryAdapter,
  RecoveryManifest,
  RecoveryVerificationReport,
  StorageKeyMapping,
  StorageRecoveryAdapter,
} from "./types";

const RPO_TARGET_MS = 3_600_000;
const RTO_TARGET_MS = 7_200_000;

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

function recordsEqual(
  actual: Record<string, number>,
  expected: Record<string, number>
): boolean {
  const actualEntries = Object.entries(actual).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

export async function verifyRestoredPackage(
  options: VerifyRestoredPackageOptions
): Promise<RecoveryVerificationReport> {
  const failedChecks = new Set<string>();
  let tableCounts: Record<string, number> = {};

  try {
    tableCounts = await options.targetDatabase.countCriticalTables();
    if (!recordsEqual(tableCounts, options.manifest.tableCounts)) {
      failedChecks.add("critical table counts differ");
    }
  } catch {
    failedChecks.add("database verification unavailable");
  }

  try {
    const invariants = await options.targetDatabase.verifyInvariants();
    if (Object.values(invariants).some(value => value !== 0)) {
      failedChecks.add("database invariants failed");
    }
  } catch {
    failedChecks.add("database invariants unavailable");
  }

  const objectArtifacts = options.manifest.artifacts.filter(
    artifact => artifact.kind === "object"
  );
  await mkdir(options.scratchRoot, { recursive: true, mode: 0o700 });
  const verificationRoot = await mkdtemp(join(options.scratchRoot, ".verify-"));
  try {
    for (const [index, artifact] of objectArtifacts.entries()) {
      const mappings = options.keyMappings.filter(
        mapping => mapping.originalKey === artifact.logicalKey
      );
      if (artifact.logicalKey === null || mappings.length !== 1) {
        failedChecks.add("storage key mapping incomplete");
        continue;
      }

      const destination = join(verificationRoot, `${index}.object`);
      try {
        await options.targetStorage.download(
          mappings[0]!.restoredKey,
          destination
        );
        const [actualHash, fileStat] = await Promise.all([
          sha256File(destination),
          stat(destination),
        ]);
        if (
          actualHash !== artifact.plaintextSha256 ||
          fileStat.size !== artifact.byteSize
        ) {
          failedChecks.add("restored object integrity differs");
        }
      } catch {
        failedChecks.add("restored object unavailable");
      }
    }
  } finally {
    await rm(verificationRoot, { recursive: true, force: true });
  }

  const now = (options.now ?? (() => new Date()))();
  const manifestTime = new Date(options.manifest.createdAt).getTime();
  const rpoMs = options.recoveryReferenceTime.getTime() - manifestTime;
  const rtoMs = now.getTime() - options.startedAt.getTime();
  if (rpoMs < 0) {
    failedChecks.add("recovery point timestamp is invalid");
  } else if (rpoMs > RPO_TARGET_MS) {
    failedChecks.add(`RPO exceeds ${RPO_TARGET_MS} ms`);
  }
  if (rtoMs < 0) {
    failedChecks.add("recovery duration is invalid");
  } else if (rtoMs > RTO_TARGET_MS) {
    failedChecks.add(`RTO exceeds ${RTO_TARGET_MS} ms`);
  }

  return {
    runId: options.manifest.id,
    status: failedChecks.size === 0 ? "approved" : "rejected",
    rpoMs,
    rtoMs,
    tableCounts,
    objectCount: objectArtifacts.length,
    failedChecks: [...failedChecks],
  };
}
