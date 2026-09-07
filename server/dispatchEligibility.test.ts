import { describe, expect, it } from "vitest";
import { evaluateDispatchEligibility } from "./dispatchEligibility";

const eligibleCandidate = {
  inShift: true,
  availableForDispatch: true,
  presenceStatus: "available" as const,
  scopeAllowed: true,
  skillAllowed: true,
  regionAllowed: true,
  hasFreshLocation: true,
};

describe("CP-016 dispatch eligibility", () => {
  it("rejects a candidate outside the active shift", () => {
    expect(evaluateDispatchEligibility({ ...eligibleCandidate, inShift: false })).toEqual({
      eligible: false,
      reasons: ["out_of_shift"],
    });
  });

  it("rejects a paused candidate", () => {
    expect(evaluateDispatchEligibility({ ...eligibleCandidate, presenceStatus: "paused" })).toEqual({
      eligible: false,
      reasons: ["paused"],
    });
  });

  it("accepts a candidate that passes every hard exclusion", () => {
    expect(evaluateDispatchEligibility(eligibleCandidate)).toEqual({
      eligible: true,
      reasons: [],
    });
  });

  it("reports hard exclusions in deterministic order", () => {
    expect(
      evaluateDispatchEligibility({
        inShift: false,
        availableForDispatch: false,
        presenceStatus: "offline",
        scopeAllowed: false,
        skillAllowed: false,
        regionAllowed: false,
        hasFreshLocation: false,
      }),
    ).toEqual({
      eligible: false,
      reasons: [
        "scope_not_allowed",
        "out_of_shift",
        "dispatch_unavailable",
        "offline",
        "skill_not_allowed",
        "region_not_allowed",
        "stale_location",
      ],
    });
  });
});
