import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const coveragePath = path.join(root, "docs/TRPC_CONTRACT_COVERAGE.md");

describe("inventário de contratos tRPC", () => {
  it("regenera a cobertura incluindo D-007A e os seis contratos D-007B", () => {
    const originalCoverage = fs.readFileSync(coveragePath, "utf8");

    try {
      const result = spawnSync(process.execPath, ["scripts/generate-trpc-coverage.mjs"], {
        cwd: root,
        encoding: "utf8",
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

      const coverage = fs.readFileSync(coveragePath, "utf8");
      expect(coverage).toContain("`workShifts.current`");
      expect(coverage).toContain("`workShifts.history`");
      expect(coverage).toContain("`workShifts.control`");
      expect(coverage).toContain("`workShiftSchedules.list`");
      expect(coverage).toContain("`workShiftSchedules.create`");
      expect(coverage).toContain("`workShiftSchedules.assign`");
      expect(coverage).toContain("`workShiftSchedules.addException`");
      expect(coverage).toContain("`workShiftSchedules.resolveForUser`");
      expect(coverage).toContain("`workShiftSchedules.coverage`");
      expect(coverage).toContain("`integrations.embeddedApplications.list`");
      expect(coverage).toContain("`integrations.embeddedApplications.adminList`");
      expect(coverage).toContain("`gis.route`");
      expect(coverage).toContain("`gis.rankCandidates`");
      expect(coverage).toContain("| Procedimentos inventariados | 110 |");
      expect(coverage).toContain("A suíte completa contém **100 arquivos e 434 testes**.");
      expect(coverage).toContain("| Arquivos de teste aprovados | 100 |");
      expect(coverage).toContain("| Casos de teste aprovados | 434 |");
    } finally {
      fs.writeFileSync(coveragePath, originalCoverage);
    }
  });
});