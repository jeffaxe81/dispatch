import { describe, expect, it } from "vitest";
import {
  validateRecoveryPreflight,
  validateRecoveryBinaries,
  validateRecoveryEnvironment,
} from "./recoveryEnvironment";

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

describe("D-005B recovery environment preflight", () => {
  it("lists every missing recovery variable without its value", () => {
    expect(() => validateRecoveryEnvironment({})).toThrow(
      "Recovery drill requires: RECOVERY_SOURCE_CLASS, DATABASE_URL, " +
        "BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY, " +
        "RECOVERY_TARGET_CLASS, RECOVERY_TARGET_DATABASE_URL, " +
        "RECOVERY_TARGET_FORGE_API_URL, RECOVERY_TARGET_FORGE_API_KEY, " +
        "RECOVERY_TARGET_STORAGE_PREFIX, RECOVERY_CONFIRM_RESTORE, " +
        "RECOVERY_ENCRYPTION_KEY"
    );
  });

  it("accepts a complete separated non-production environment", () => {
    expect(() =>
      validateRecoveryEnvironment(completeRecoveryEnvironment)
    ).not.toThrow();
  });

  it("rejects equal source and target storage credentials", () => {
    expect(() =>
      validateRecoveryEnvironment({
        ...completeRecoveryEnvironment,
        RECOVERY_TARGET_FORGE_API_KEY:
          completeRecoveryEnvironment.BUILT_IN_FORGE_API_KEY,
      })
    ).toThrow("source and target storage keys must differ");
  });

  it("rejects unavailable native clients before test collection", async () => {
    await expect(
      validateRecoveryBinaries({ which: async () => false })
    ).rejects.toThrow("mysqldump and mysql are required");
  });

  it("requires both native clients", async () => {
    const observed: string[] = [];
    await expect(
      validateRecoveryBinaries({
        which: async binary => {
          observed.push(binary);
          return true;
        },
      })
    ).resolves.toBeUndefined();
    expect(observed).toEqual(["mysqldump", "mysql"]);
  });

  it("aggregates missing variables and binaries for the global preflight", async () => {
    await expect(
      validateRecoveryPreflight({}, { which: async () => false })
    ).rejects.toThrow(
      /Recovery drill requires: RECOVERY_SOURCE_CLASS[\s\S]*mysqldump and mysql are required/
    );
  });
});
