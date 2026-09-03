import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli, type RecoveryCliOperations } from "./cli";

describe("recovery CLI", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-recovery-cli-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function operations(): RecoveryCliOperations {
    return {
      backup: vi.fn(async () => ({
        runId: "d005-cli-backup",
        outcome: "complete",
      })),
      restore: vi.fn(async () => ({
        runId: "d005-cli-restore",
        outcome: "approved",
      })),
      verify: vi.fn(async () => ({
        runId: "d005-cli-verify",
        outcome: "approved",
      })),
    };
  }

  it("offers only backup, restore and verify commands", async () => {
    const help = await runCli(["--help"], {}, operations());
    const rejected = await runCli(["delete"], {}, operations());

    expect(help).toMatchObject({ code: 0, stderr: "" });
    expect(help.stdout).toContain("backup | restore | verify");
    expect(rejected).toMatchObject({ code: 2, stdout: "" });
    expect(rejected.stderr).toContain("invalid recovery command");
  });

  it("parses an absolute backup destination and emits only sanitized progress", async () => {
    const fake = operations();

    const result = await runCli(
      [
        "backup",
        "--",
        "--output",
        root,
        "--source-label",
        "homologacao-controlada",
      ],
      { DATABASE_URL: "mysql://user:database-secret@db.test/source" },
      fake
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(
      /^run=d005-cli-backup stage=backup elapsed_ms=\d+ outcome=complete\n$/
    );
    expect(result.stdout).not.toMatch(/database-secret|mysql:\/\//);
    expect(fake.backup).toHaveBeenCalledWith({
      outputRoot: root,
      sourceLabel: "homologacao-controlada",
      env: { DATABASE_URL: "mysql://user:database-secret@db.test/source" },
    });
  });

  it("rejects relative paths and unknown flags before an operation runs", async () => {
    const fake = operations();

    const relative = await runCli(
      ["restore", "--package", "relative/package"],
      {},
      fake
    );
    const unknown = await runCli(
      ["verify", "--package", root, "--delete", "yes"],
      {},
      fake
    );

    expect(relative.code).toBe(2);
    expect(unknown.code).toBe(2);
    expect(fake.restore).not.toHaveBeenCalled();
    expect(fake.verify).not.toHaveBeenCalled();
  });

  it("rejects a symlinked package root", async () => {
    const realPackage = join(root, "real-package");
    const linkedPackage = join(root, "linked-package");
    await mkdir(realPackage);
    await symlink(realPackage, linkedPackage, "dir");
    const fake = operations();

    const result = await runCli(
      ["restore", "--package", linkedPackage],
      {},
      fake
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("package path must not use symlinks");
    expect(fake.restore).not.toHaveBeenCalled();
  });

  it("prints a sanitized failure and returns non-zero", async () => {
    const packageRoot = join(root, "package");
    await mkdir(packageRoot);
    const fake = operations();
    vi.mocked(fake.restore).mockRejectedValueOnce(
      new Error(
        "mysql://target:database-secret@db.test/dispatch_recovery_d005 token=secret"
      )
    );

    const result = await runCli(
      ["restore", "--package", packageRoot],
      {
        RECOVERY_TARGET_DATABASE_URL:
          "mysql://target:database-secret@db.test/dispatch_recovery_d005",
        RECOVERY_TARGET_FORGE_API_KEY: "target-storage-secret",
      },
      fake
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("recovery failed:");
    expect(result.stderr).not.toMatch(
      /database-secret|target-storage-secret|token=secret|mysql:\/\//
    );
  });
});
