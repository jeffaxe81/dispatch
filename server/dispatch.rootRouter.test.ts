import { describe, expect, it } from "vitest";
import { rootRouter } from "./rootRouter";

describe("application root router with D-007C", () => {
  it("registra dispatch.rankEligibleCandidates sem remover GIS e jornadas existentes", () => {
    const procedures = rootRouter._def.procedures;

    expect(procedures["dispatch.rankEligibleCandidates"]).toBeDefined();
    expect(procedures["gis.rankCandidates"]).toBeDefined();
    expect(procedures["workShifts.current"]).toBeDefined();
    expect(procedures["workShiftSchedules.list"]).toBeDefined();
  });
});
