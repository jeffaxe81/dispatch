import { describe, expect, it } from "vitest";
import { rootRouter } from "./rootRouter";

describe("D-007D1 root router composition", () => {
  it("registra os quatro contratos de ajustes auditáveis", () => {
    const procedures = Object.keys((rootRouter as any)._def.procedures);

    expect(procedures).toEqual(expect.arrayContaining([
      "workShiftAdjustments.list",
      "workShiftAdjustments.request",
      "workShiftAdjustments.approve",
      "workShiftAdjustments.reject",
    ]));
  });
});
