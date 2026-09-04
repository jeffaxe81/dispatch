import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const coveragePath = path.join(root, "docs/TRPC_CONTRACT_COVERAGE.md");

describe("inventário de contratos tRPC", () => {
  it("regenera a cobertura incluindo os três contratos de jornada", () => {
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
      expect(coverage).toContain("| Procedimentos inventariados | 100 |");
    } finally {
      fs.writeFileSync(coveragePath, originalCoverage);
    }
  });
});
