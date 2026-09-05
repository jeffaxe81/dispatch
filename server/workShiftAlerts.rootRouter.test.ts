import { describe, expect, it } from "vitest";
import { rootRouter } from "./rootRouter";

describe("D-007D3 root router composition", () => {
  it("publica os quatro procedures de alertas de jornada", () => {
    const procedures = (rootRouter as any)._def.procedures;
    expect(procedures["workShiftAlerts.list"]).toBeDefined();
    expect(procedures["workShiftAlerts.evaluate"]).toBeDefined();
    expect(procedures["workShiftAlerts.acknowledge"]).toBeDefined();
    expect(procedures["workShiftAlerts.resolve"]).toBeDefined();
  });
});
