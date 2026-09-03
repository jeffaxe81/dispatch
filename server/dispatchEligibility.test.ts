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

  it("reports hard exclusions in deterministic order", () => {
    expect(
      evaluateDispatchEligibility({
        ...base,
        scopeAllowed: false,
        inShift: false,
        availableForDispatch: false,
        presenceStatus: "offline",
        skillAllowed: false,
        regionAllowed: false,
        hasFreshLocation: false,
      }),
    ).toEqual({
      eligible: false,
      reasons: [
        "scope_not_allowed",
        "out_of_shift",
        "dispatch_disabled",
        "offline",
        "skill_not_allowed",
        "region_not_allowed",
        "stale_location",
      ],
    });
  });

  it("accepts a fully eligible candidate", () => {
    expect(evaluateDispatchEligibility(base)).toEqual({ eligible: true, reasons: [] });
  });
});
