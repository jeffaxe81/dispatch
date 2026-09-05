import { describe, expect, it } from "vitest";
import { createWorkShiftAdjustmentDbStore } from "./workShiftAdjustmentDbStore";

describe("D-007D1 work shift adjustment db store", () => {
  it("expõe leitura, escopo, criação e decisões transacionais", () => {
    const store = createWorkShiftAdjustmentDbStore({} as never);

    expect(Object.keys(store).sort()).toEqual([
      "approveAdjustment",
      "createAdjustment",
      "getAdjustmentById",
      "getSessionScope",
      "getSessionSnapshot",
      "listAdjustments",
      "rejectAdjustment",
    ]);
  });
});
