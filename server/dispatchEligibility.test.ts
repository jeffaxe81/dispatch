import { describe, expect, it } from "vitest";
import { evaluateDispatchEligibility } from "./dispatchEligibility";

const base = {
  inShift: true,
  availableForDispatch: true,
  presenceStatus: "available" as const,
  scopeAllowed: true,
  skillAllowed: true,
  regionAllowed: true,
  hasFreshLocation: true,
};

describe("dispatch eligibility", () => {
  it("rejects a team outside its shift", () => {
    expect(evaluateDispatchEligibility({ ...base, inShift: false })).toEqual({
      eligible: false,
      reasons: ["out_of_shift"],
    });
  });

  it("rejects a paused team even when it is geographically close", () => {
    expect(evaluateDispatchEligibility({ ...base, presenceStatus: "paused" })).toEqual({
      eligible: false,
      reasons: ["paused"],
    });
  });

  it("accepts a fully eligible candidate", () => {
    expect(evaluateDispatchEligibility(base)).toEqual({ eligible: true, reasons: [] });
  });
});
