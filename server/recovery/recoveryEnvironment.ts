import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { readRecoveryConfig } from "./config";

const REQUIRED_RECOVERY_VARIABLES = [
  "RECOVERY_SOURCE_CLASS",
  "DATABASE_URL",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
  "RECOVERY_TARGET_CLASS",
  "RECOVERY_TARGET_DATABASE_URL",
  "RECOVERY_TARGET_FORGE_API_URL",
  "RECOVERY_TARGET_FORGE_API_KEY",
  "RECOVERY_TARGET_STORAGE_PREFIX",
  "RECOVERY_CONFIRM_RESTORE",
  "RECOVERY_ENCRYPTION_KEY",
] as const;

export function validateRecoveryEnvironment(
  environment: Record<string, string | undefined>
): void {
  const missing = REQUIRED_RECOVERY_VARIABLES.filter(
    name => !environment[name]?.trim()
  );
  if (missing.length > 0) {
    throw new Error(`Recovery drill requires: ${missing.join(", ")}`);
  }

  readRecoveryConfig(environment, "backup");
  readRecoveryConfig(environment, "restore");
}

async function executableOnPath(binary: string): Promise<boolean> {
  const path = process.env.PATH;
  if (!path) return false;
  for (const directory of path.split(delimiter)) {
    if (!directory) continue;
    try {
      await access(join(directory, binary), constants.X_OK);
      return true;
    } catch {
      // Continue through the fixed PATH entries without invoking a shell.
    }
  }
  return false;
}

export async function validateRecoveryBinaries(
  options: {
    which?: (binary: string) => Promise<boolean>;
  } = {}
): Promise<void> {
  const which = options.which ?? executableOnPath;
  const available: boolean[] = [];
  for (const binary of ["mysqldump", "mysql"] as const) {
    available.push(await which(binary));
  }
  if (available.some(value => !value)) {
    throw new Error("mysqldump and mysql are required");
  }
}

export async function validateRecoveryPreflight(
  environment: Record<string, string | undefined>,
  options: { which?: (binary: string) => Promise<boolean> } = {}
): Promise<void> {
  const failures: string[] = [];
  try {
    validateRecoveryEnvironment(environment);
  } catch (error) {
    failures.push(
      error instanceof Error
        ? error.message
        : "recovery environment validation failed"
    );
  }
  try {
    await validateRecoveryBinaries(options);
  } catch {
    failures.push("mysqldump and mysql are required");
  }
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}
