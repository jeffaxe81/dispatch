import { lstat, mkdir, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runBackup } from "./backup";
import { readRecoveryConfig } from "./config";
import { MysqlCliRecoveryAdapter } from "./databaseAdapter";
import {
  readAndValidateManifest,
  readRecoveryVersionMetadata,
} from "./manifest";
import { runRestore } from "./restore";
import { ForgeRecoveryStorageAdapter } from "./storageAdapter";
import type { StorageKeyMapping } from "./types";
import { verifyRestoredPackage } from "./verifier";

type RecoveryEnvironment = Record<string, string | undefined>;
type RecoveryOutcome = "complete" | "approved" | "rejected";

interface RecoveryOperationResult {
  runId: string;
  outcome: RecoveryOutcome;
}

interface BackupCommandInput {
  outputRoot: string;
  sourceLabel: string;
  env: RecoveryEnvironment;
}

interface PackageCommandInput {
  packageRoot: string;
  env: RecoveryEnvironment;
}

export interface RecoveryCliOperations {
  backup(input: BackupCommandInput): Promise<RecoveryOperationResult>;
  restore(input: PackageCommandInput): Promise<RecoveryOperationResult>;
  verify(input: PackageCommandInput): Promise<RecoveryOperationResult>;
}

export interface RecoveryCliResult {
  code: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

class CliUsageError extends Error {}

const HELP = `AXE Dispatch recovery administration
Usage: backup | restore | verify
  backup  --output <absolute-path> --source-label <label>
  restore --package <absolute-path>
  verify  --package <absolute-path>
`;

function parseFlags(
  values: string[],
  allowed: readonly string[]
): Record<string, string> {
  const tokens = values[0] === "--" ? values.slice(1) : values;
  const parsed: Record<string, string> = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const name = tokens[index];
    const value = tokens[index + 1];
    if (!name || !allowed.includes(name)) {
      throw new CliUsageError("unknown recovery flag");
    }
    if (!value || value.startsWith("--")) {
      throw new CliUsageError("recovery flag requires a value");
    }
    if (name in parsed) {
      throw new CliUsageError("duplicate recovery flag");
    }
    parsed[name] = value;
  }
  return parsed;
}

function requiredFlag(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (!value) throw new CliUsageError(`missing ${name}`);
  return value;
}

function requireAbsolutePath(value: string): string {
  if (!isAbsolute(value)) {
    throw new CliUsageError("recovery paths must be absolute");
  }
  return resolve(value);
}

async function validatePackageRoot(packageRoot: string): Promise<void> {
  let packageStat;
  let canonicalPath;
  try {
    [packageStat, canonicalPath] = await Promise.all([
      lstat(packageRoot),
      realpath(packageRoot),
    ]);
  } catch {
    throw new CliUsageError("package path must exist");
  }
  if (
    packageStat.isSymbolicLink() ||
    !packageStat.isDirectory() ||
    canonicalPath !== packageRoot
  ) {
    throw new CliUsageError("package path must not use symlinks");
  }
}

async function writeOperationReport(
  packageRoot: string,
  name: "restore" | "verify",
  report: unknown
): Promise<void> {
  const reportsRoot = join(packageRoot, "reports");
  const reportPath = join(reportsRoot, `${name}-report.json`);
  const partialPath = `${reportPath}.partial`;
  await mkdir(reportsRoot, { recursive: true, mode: 0o700 });
  await writeFile(partialPath, JSON.stringify(report), { mode: 0o600 });
  await rename(partialPath, reportPath);
}

function createDefaultOperations(): RecoveryCliOperations {
  return {
    async backup(input) {
      const config = readRecoveryConfig(input.env, "backup");
      if (config.command !== "backup") throw new Error("invalid backup mode");
      const versions = await readRecoveryVersionMetadata(process.cwd());
      const result = await runBackup({
        database: new MysqlCliRecoveryAdapter({
          databaseUrl: config.sourceDatabaseUrl,
        }),
        storage: new ForgeRecoveryStorageAdapter({
          apiUrl: config.sourceStorage.apiUrl,
          apiKey: config.sourceStorage.apiKey,
          targetPrefix: "",
        }),
        encryptionKey: config.encryptionKey,
        outputRoot: input.outputRoot,
        appVersion: versions.appVersion,
        schemaVersion: versions.schemaVersion,
        sourceClass: config.sourceClass,
        sourceLabel: input.sourceLabel,
      });
      return { runId: result.manifest.id, outcome: "complete" };
    },

    async restore(input) {
      const config = readRecoveryConfig(input.env, "restore");
      if (config.command !== "restore") {
        throw new Error("invalid restore mode");
      }
      const targetDatabase = new MysqlCliRecoveryAdapter({
        databaseUrl: config.targetDatabaseUrl,
      });
      const targetStorage = new ForgeRecoveryStorageAdapter({
        apiUrl: config.targetStorage.apiUrl,
        apiKey: config.targetStorage.apiKey,
        targetPrefix: config.targetStorage.prefix,
      });
      const report = await runRestore({
        packageRoot: input.packageRoot,
        targetDatabase,
        targetStorage,
        encryptionKey: config.encryptionKey,
        scratchRoot: join(dirname(input.packageRoot), ".recovery-scratch"),
        recoveryReferenceTime: new Date(),
      });
      await writeOperationReport(input.packageRoot, "restore", report);
      return { runId: report.runId, outcome: report.status };
    },

    async verify(input) {
      const config = readRecoveryConfig(input.env, "verify");
      if (config.command !== "verify") throw new Error("invalid verify mode");
      const manifest = await readAndValidateManifest(
        input.packageRoot,
        config.encryptionKey
      );
      const targetDatabase = new MysqlCliRecoveryAdapter({
        databaseUrl: config.targetDatabaseUrl,
      });
      const targetStorage = new ForgeRecoveryStorageAdapter({
        apiUrl: config.targetStorage.apiUrl,
        apiKey: config.targetStorage.apiKey,
        targetPrefix: config.targetStorage.prefix,
      });
      const keyMappings: StorageKeyMapping[] = manifest.artifacts
        .filter(artifact => artifact.kind === "object")
        .map(artifact => {
          if (artifact.logicalKey === null) {
            throw new Error("invalid object artifact");
          }
          const normalizedKey = artifact.logicalKey.replace(/^\/+/, "");
          return {
            originalKey: artifact.logicalKey,
            restoredKey: `${config.targetStorage.prefix}/${normalizedKey}`,
            references: artifact.references,
          };
        });
      const startedAt = new Date();
      const report = await verifyRestoredPackage({
        manifest,
        targetDatabase,
        targetStorage,
        keyMappings,
        scratchRoot: join(dirname(input.packageRoot), ".recovery-scratch"),
        encryptionKey: config.encryptionKey,
        startedAt,
        recoveryReferenceTime: startedAt,
      });
      await writeOperationReport(input.packageRoot, "verify", report);
      return { runId: report.runId, outcome: report.status };
    },
  };
}

export async function runCli(
  argv: string[],
  env: RecoveryEnvironment,
  operations: RecoveryCliOperations = createDefaultOperations()
): Promise<RecoveryCliResult> {
  if (argv.length === 1 && argv[0] === "--help") {
    return { code: 0, stdout: HELP, stderr: "" };
  }

  const [command, ...values] = argv;
  if (command !== "backup" && command !== "restore" && command !== "verify") {
    return {
      code: 2,
      stdout: "",
      stderr: "invalid recovery command; use --help\n",
    };
  }

  const startedAt = Date.now();
  try {
    let result: RecoveryOperationResult;
    if (command === "backup") {
      const flags = parseFlags(values, ["--output", "--source-label"]);
      const outputRoot = requireAbsolutePath(requiredFlag(flags, "--output"));
      const sourceLabel = requiredFlag(flags, "--source-label");
      result = await operations.backup({ outputRoot, sourceLabel, env });
    } else {
      const flags = parseFlags(values, ["--package"]);
      const packageRoot = requireAbsolutePath(requiredFlag(flags, "--package"));
      await validatePackageRoot(packageRoot);
      result = await operations[command]({ packageRoot, env });
    }

    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const progress = `run=${result.runId} stage=${command} elapsed_ms=${elapsedMs} outcome=${result.outcome}\n`;
    if (result.outcome === "rejected") {
      return {
        code: 1,
        stdout: progress,
        stderr: "recovery failed: verification rejected\n",
      };
    }
    return { code: 0, stdout: progress, stderr: "" };
  } catch (error) {
    if (error instanceof CliUsageError) {
      return { code: 2, stdout: "", stderr: `${error.message}\n` };
    }
    return {
      code: 1,
      stdout: "",
      stderr: "recovery failed: operation did not complete\n",
    };
  }
}

async function executeMain(): Promise<void> {
  const result = await runCli(process.argv.slice(2), process.env);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.code;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  void executeMain();
}
