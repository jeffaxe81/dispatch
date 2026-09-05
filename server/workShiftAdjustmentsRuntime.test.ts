import { describe, expect, it } from "vitest";
import { assertWorkShiftAdjustmentScope } from "./workShiftAdjustmentsRuntime";

describe("D-007D1 adjustment server-side scope", () => {
  it("allows wildcard actors", () => {
    expect(() => assertWorkShiftAdjustmentScope(
      { userId: 1, organizationId: null, organizationalUnitId: null, permissions: ["*"] },
      { organizationId: null, organizationalUnitId: null },
    )).not.toThrow();
  });

  it("allows the actor organization and unit", () => {
    expect(() => assertWorkShiftAdjustmentScope(
      { userId: 2, organizationId: 10, organizationalUnitId: 20, permissions: ["work_shifts.adjust"] },
      { organizationId: 10, organizationalUnitId: 20 },
    )).not.toThrow();
  });

  it("fails closed for another organization", () => {
    expect(() => assertWorkShiftAdjustmentScope(
      { userId: 2, organizationId: 10, organizationalUnitId: null, permissions: ["work_shifts.adjust"] },
      { organizationId: 11, organizationalUnitId: null },
    )).toThrow(/escopo|organiza/i);
  });

  it("fails closed for another unit or unresolved scope", () => {
    const actor = { userId: 2, organizationId: 10, organizationalUnitId: 20, permissions: ["work_shifts.adjust"] };
    expect(() => assertWorkShiftAdjustmentScope(actor, { organizationId: 10, organizationalUnitId: 21 })).toThrow(/escopo|unidade/i);
    expect(() => assertWorkShiftAdjustmentScope(actor, { organizationId: null, organizationalUnitId: null })).toThrow(/escopo|resolv/i);
  });
});
