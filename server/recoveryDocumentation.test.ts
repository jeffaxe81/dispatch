import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

describe("D-005 recovery documentation", () => {
  it("documents exact safety gates without claiming production proof", () => {
    const runbook = read("docs/source-package/BACKUP_RESTORE_RUNBOOK.md");
    expect(runbook).toContain("RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH");
    expect(runbook).toContain("dispatch_recovery_");
    expect(runbook).toContain("pnpm test:recovery");
    expect(runbook).toContain("não comprovado em produção");
    expect(runbook).toContain("RECOVERY_SOURCE_CLASS=non-production");
    expect(runbook).not.toMatch(
      /mysql:\/\/[^\s]+:[^\s]+@|Bearer\s+[A-Za-z0-9._-]{12,}/
    );
  });

  it("keeps backup artifacts and private reports out of Git", () => {
    const ignore = read(".gitignore");
    expect(ignore).toContain("recovery-packages/");
    expect(ignore).toContain("*.recovery.enc");
    expect(ignore).toContain("*.sql.enc");
    expect(ignore).toContain("recovery-report.private.json");
  });

  it("separates drill controls, evidence and the D-005B approval boundary", () => {
    const checklist = read("docs/source-package/RECOVERY_DRILL_CHECKLIST.md");
    const evidence = read("docs/source-package/RECOVERY_EVIDENCE_TEMPLATE.md");
    const decision = read("docs/decisions/D005-backup-restore-proof.md");

    expect(checklist).toMatch(/## Antes[\s\S]*## Durante[\s\S]*## Depois/);
    expect(evidence).toMatch(/RPO[\s\S]*RTO[\s\S]*Aprovação humana/);
    expect(evidence).toContain("Não registrar credenciais");
    expect(decision).toContain("D-005A: validada em ambiente controlado");
    expect(decision).toContain("D-005B: pendente");
    expect(decision).toContain("D-005C");
  });

  it("records candidate 1.15.5 consistently and truthfully", () => {
    const manifest = JSON.parse(read("package.json"));
    const security = read("scripts/security-regression-check.mjs");
    const changelog = read("docs/source-package/CHANGELOG.md");

    expect(manifest.version).toBe("1.15.5");
    expect(security).toContain('packageJson.version === "1.15.5"');
    expect(changelog.indexOf("## [1.15.5]")).toBeLessThan(
      changelog.indexOf("## [1.15.4]")
    );
    expect(changelog).toContain("D-005B permanece pendente");
    expect(changelog).toMatch(/\d+ testes[^\n]+\d+ arquivos/);
  });
});
