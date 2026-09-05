import type { OperationalPresenceStatus } from "../shared/operations";

export type DispatchEligibilityReason =
  | "scope_not_allowed"
  | "out_of_shift"
  | "dispatch_unavailable"
  | "busy"
  | "paused"
  | "offline"
  | "skill_not_allowed"
  | "region_not_allowed"
  | "stale_location";

export type DispatchEligibilityCandidate = {
  scopeAllowed: boolean;
  inShift: boolean;
  availableForDispatch: boolean;
  presenceStatus: OperationalPresenceStatus;
  skillAllowed: boolean;
  regionAllowed: boolean;
  hasFreshLocation: boolean;
};

export type DispatchEligibilityResult = {
  eligible: boolean;
  reasons: DispatchEligibilityReason[];
};

export function evaluateDispatchEligibility(
  candidate: DispatchEligibilityCandidate,
): DispatchEligibilityResult {
  const reasons: DispatchEligibilityReason[] = [];
  const addReason = (reason: DispatchEligibilityReason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (!candidate.scopeAllowed) addReason("scope_not_allowed");
  if (!candidate.inShift) addReason("out_of_shift");
  if (!candidate.availableForDispatch) addReason("dispatch_unavailable");

  if (candidate.presenceStatus !== "available") {
    addReason(candidate.presenceStatus === "out_of_shift" ? "out_of_shift" : candidate.presenceStatus);
  }

  if (!candidate.skillAllowed) addReason("skill_not_allowed");
  if (!candidate.regionAllowed) addReason("region_not_allowed");
  if (!candidate.hasFreshLocation) addReason("stale_location");

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}
