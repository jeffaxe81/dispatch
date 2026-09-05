import { describe, expect, it } from "vitest";
import { createWorkShiftReportsRouter } from "./workShiftReportsRouter";

const deps = {
  overview: async () => ({ rows: [], summary: {} }),
  sessions: async () => ({ rows: [], summary: {} }),
  coverage: async () => [],
  exportReport: async () => ({ format: "csv", rowCount: 0 }),
};

describe("D-007D2 work shift reports router", () => {
  it("expõe os quatro contratos previstos", () => {
    const router = createWorkShiftReportsRouter(deps as never);
    expect(Object.keys((router as any)._def.procedures).sort()).toEqual([
      "coverage",
      "export",
      "overview",
      "sessions",
    ]);
  });
});
