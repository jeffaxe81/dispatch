import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const coveragePath = path.join(root, "docs/TRPC_CONTRACT_COVERAGE.md");

describe("inventário de contratos tRPC", () => {
  it("regenera a cobertura incluindo jornadas, despacho e workspace D-010", () => {
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
      expect(coverage).toContain("`dispatch.rankEligibleCandidates`");
      expect(coverage).toContain("`integrations.embeddedApplications.list`");
      expect(coverage).toContain("`integrations.embeddedApplications.adminList`");
      expect(coverage).toContain("`gis.route`");
      expect(coverage).toContain("`gis.rankCandidates`");
      expect(coverage).toContain("`workspace.getOwn`");
      expect(coverage).toContain("`workspace.getOwnScreen`");
      expect(coverage).toContain("`workspace.saveOwn`");
      expect(coverage).toContain("`workspace.resetOwn`");
      expect(coverage).toContain("| Procedimentos inventariados | 115 |");
      expect(coverage).toContain("D-010");
    } finally {
      fs.writeFileSync(coveragePath, originalCoverage);
    }
  });
});
