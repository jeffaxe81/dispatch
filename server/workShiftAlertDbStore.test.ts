import { describe, expect, it } from "vitest";
import { createWorkShiftAlertDbStore } from "./workShiftAlertDbStore";

describe("D-007D3 work shift alert db store", () => {
  it("expõe persistência deduplicada, listagem e transições", () => {
    const store = createWorkShiftAlertDbStore({} as never);
    expect(Object.keys(store).sort()).toEqual([
      "acknowledgeAlert",
      "listAlerts",
      "persistDetectedAlerts",
      "resolveAlert",
    ]);
  });
});
