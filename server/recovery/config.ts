import type { RecoveryConfig, RecoverySourceClass } from "./types";

export const RESTORE_CONFIRMATION =
  "RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH" as const;

function required(
  env: Record<string, string | undefined>,
  name: string
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readEncryptionKey(value: string | undefined): Buffer {
  if (!value) {
    throw new Error("RECOVERY_ENCRYPTION_KEY is required");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("RECOVERY_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function readSafePrefix(value: string | undefined): string {
  const prefix = required(
    { RECOVERY_TARGET_STORAGE_PREFIX: value },
    "RECOVERY_TARGET_STORAGE_PREFIX"
  );
  if (prefix.startsWith("/") || prefix.endsWith("/")) {
    throw new Error(
      "RECOVERY_TARGET_STORAGE_PREFIX must not contain empty segments"
    );
  }
  for (const segment of prefix.split("/")) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error(
        "RECOVERY_TARGET_STORAGE_PREFIX must not contain unsafe segments"
      );
    }
  }
  return prefix;
}

function readDatabaseUrl(
  env: Record<string, string | undefined>,
  name: "DATABASE_URL" | "RECOVERY_TARGET_DATABASE_URL"
): URL {
  const value = required(env, name);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

export function readRecoveryConfig(
  env: Record<string, string | undefined>,
  command: "backup" | "restore" | "verify"
): RecoveryConfig {
  const encryptionKey = readEncryptionKey(env.RECOVERY_ENCRYPTION_KEY);
  if (command === "backup") {
    const sourceClass = required(env, "RECOVERY_SOURCE_CLASS");
    if (sourceClass === "production") {
      throw new Error("production sources are disabled until D-005C");
    }
    if (sourceClass !== "synthetic" && sourceClass !== "non-production") {
      throw new Error(
        "RECOVERY_SOURCE_CLASS must be synthetic or non-production"
      );
    }
    const sourceDatabaseUrl = readDatabaseUrl(env, "DATABASE_URL").href;
    if (
      env.RECOVERY_TARGET_DATABASE_URL &&
      sourceDatabaseUrl ===
        readDatabaseUrl(env, "RECOVERY_TARGET_DATABASE_URL").href
    ) {
      throw new Error("source and target database URLs must differ");
    }
    const sourceStorageKey = required(env, "BUILT_IN_FORGE_API_KEY");
    if (
      env.RECOVERY_TARGET_FORGE_API_KEY &&
      sourceStorageKey === env.RECOVERY_TARGET_FORGE_API_KEY
    ) {
      throw new Error("source and target storage keys must differ");
    }
    return {
      command,
      sourceClass: sourceClass as RecoverySourceClass,
      sourceDatabaseUrl,
      sourceStorage: {
        apiUrl: required(env, "BUILT_IN_FORGE_API_URL"),
        apiKey: sourceStorageKey,
        prefix: "",
      },
      encryptionKey,
    };
  }
  const target = readDatabaseUrl(env, "RECOVERY_TARGET_DATABASE_URL");
  if (
    env.DATABASE_URL &&
    readDatabaseUrl(env, "DATABASE_URL").href === target.href
  ) {
    throw new Error("source and target database URLs must differ");
  }
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
  if (
    env.BUILT_IN_FORGE_API_KEY &&
    env.BUILT_IN_FORGE_API_KEY === targetStorage.apiKey
  ) {
    throw new Error("source and target storage keys must differ");
  }
  return {
    command,
    targetDatabaseUrl: target.href,
    targetStorage,
    encryptionKey,
  };
}
