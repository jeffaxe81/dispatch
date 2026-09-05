import { describe, expect, it } from "vitest";
import { rootRouter } from "./rootRouter";

describe("D-007D2 work shift reports root router", () => {
  it("publica os quatro contratos de relatórios de jornada", () => {
    const procedures = (rootRouter as any)._def.procedures;
    expect(procedures["workShiftReports.overview"]).toBeDefined();
    expect(procedures["workShiftReports.sessions"]).toBeDefined();
    expect(procedures["workShiftReports.coverage"]).toBeDefined();
    expect(procedures["workShiftReports.export"]).toBeDefined();
  });
});
