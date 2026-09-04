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
        "backup"
      )
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
        "restore"
      )
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
          ].includes(name)
      )
    );
    expect(readRecoveryConfig(targetOnly, "restore").command).toBe("restore");
  });

  it("rejects equal source and target database URLs", () => {
    expect(() =>
      readRecoveryConfig(
        {
          ...valid,
          RECOVERY_TARGET_DATABASE_URL: valid.DATABASE_URL,
        },
        "backup"
      )
    ).toThrow("source and target database URLs must differ");
  });

  it("rejects equal source and target storage keys", () => {
    expect(() =>
      readRecoveryConfig(
        {
          ...valid,
          RECOVERY_TARGET_FORGE_API_KEY: valid.BUILT_IN_FORGE_API_KEY,
        },
        "backup"
      )
    ).toThrow("source and target storage keys must differ");
  });

  it("sanitizes an invalid source database URL", () => {
    const secretUrl = "not a URL with source-secret";

    expect(() =>
      readRecoveryConfig({ ...valid, DATABASE_URL: secretUrl }, "backup")
    ).toThrow("DATABASE_URL must be a valid URL");

    try {
      readRecoveryConfig({ ...valid, DATABASE_URL: secretUrl }, "backup");
    } catch (error) {
      expect(error).not.toHaveProperty("input");
      expect(JSON.stringify(error)).not.toContain(secretUrl);
    }
  });

  it("sanitizes an invalid target database URL", () => {
    const secretUrl = "not a URL with target-secret";

    expect(() =>
      readRecoveryConfig(
        { ...valid, RECOVERY_TARGET_DATABASE_URL: secretUrl },
        "restore"
      )
    ).toThrow("RECOVERY_TARGET_DATABASE_URL must be a valid URL");

    try {
      readRecoveryConfig(
        { ...valid, RECOVERY_TARGET_DATABASE_URL: secretUrl },
        "restore"
      );
    } catch (error) {
      expect(error).not.toHaveProperty("input");
      expect(JSON.stringify(error)).not.toContain(secretUrl);
    }
  });

  it("rejects an invalid Base64 encryption key", () => {
    expect(() =>
      readRecoveryConfig(
        { ...valid, RECOVERY_ENCRYPTION_KEY: "not-base64" },
        "backup"
      )
    ).toThrow("RECOVERY_ENCRYPTION_KEY must decode to exactly 32 bytes");
  });

  it("rejects an inexact restore confirmation", () => {
    expect(() =>
      readRecoveryConfig(
        {
          ...valid,
          RECOVERY_CONFIRM_RESTORE: "RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH ",
        },
        "restore"
      )
    ).toThrow("restore confirmation does not match");
  });

  it("rejects storage prefix traversal", () => {
    expect(() =>
      readRecoveryConfig(
        {
          ...valid,
          RECOVERY_TARGET_STORAGE_PREFIX: "recovery-drills/../d005",
        },
        "restore"
      )
    ).toThrow(
      "RECOVERY_TARGET_STORAGE_PREFIX must not contain unsafe segments"
    );
  });
});
