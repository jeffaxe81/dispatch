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
  it("rejects a team outside its allowed scope", () => {
    expect(evaluateDispatchEligibility({ ...base, scopeAllowed: false })).toEqual({
      eligible: false,
      reasons: ["scope_not_allowed"],
    });
  });

  it("rejects a team outside its shift", () => {
    expect(evaluateDispatchEligibility({ ...base, inShift: false })).toEqual({
      eligible: false,
      reasons: ["out_of_shift"],
    });
  });

  it("rejects a team disabled for dispatch", () => {
    expect(evaluateDispatchEligibility({ ...base, availableForDispatch: false })).toEqual({
      eligible: false,
      reasons: ["dispatch_unavailable"],
    });
  });

  it("rejects a paused team even when it is geographically close", () => {
    expect(evaluateDispatchEligibility({ ...base, presenceStatus: "paused" })).toEqual({
      eligible: false,
      reasons: ["paused"],
    });
  });

  it("rejects a busy team", () => {
    expect(evaluateDispatchEligibility({ ...base, presenceStatus: "busy" })).toEqual({
      eligible: false,
      reasons: ["busy"],
    });
  });

  it("rejects an offline team", () => {
    expect(evaluateDispatchEligibility({ ...base, presenceStatus: "offline" })).toEqual({
      eligible: false,
      reasons: ["offline"],
    });
  });

  it("rejects presence marked out of shift", () => {
    expect(evaluateDispatchEligibility({ ...base, presenceStatus: "out_of_shift" })).toEqual({
      eligible: false,
      reasons: ["out_of_shift"],
    });
  });

  it("rejects a team without the required skill", () => {
    expect(evaluateDispatchEligibility({ ...base, skillAllowed: false })).toEqual({
      eligible: false,
      reasons: ["skill_not_allowed"],
    });
  });

  it("rejects a team outside the incident region", () => {
    expect(evaluateDispatchEligibility({ ...base, regionAllowed: false })).toEqual({
      eligible: false,
      reasons: ["region_not_allowed"],
    });
  });

  it("rejects a team without a fresh location", () => {
    expect(evaluateDispatchEligibility({ ...base, hasFreshLocation: false })).toEqual({
      eligible: false,
      reasons: ["stale_location"],
    });
  });

  it("returns exclusion reasons in deterministic hard-rule order", () => {
    expect(
      evaluateDispatchEligibility({
        ...base,
        scopeAllowed: false,
        inShift: false,
        availableForDispatch: false,
        presenceStatus: "paused",
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
        "paused",
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
