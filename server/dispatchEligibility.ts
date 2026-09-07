import type { OperationalPresenceStatus } from "../shared/operations";

export type DispatchEligibilityCandidate = {
  inShift: boolean;
  availableForDispatch: boolean;
  presenceStatus: OperationalPresenceStatus;
  scopeAllowed: boolean;
  skillAllowed: boolean;
  regionAllowed: boolean;
  hasFreshLocation: boolean;
};

export type DispatchEligibilityResult = {
  eligible: boolean;
  reasons: string[];
};

export function evaluateDispatchEligibility(
  candidate: DispatchEligibilityCandidate,
): DispatchEligibilityResult {
  const reasons: string[] = [];

  if (!candidate.scopeAllowed) reasons.push("scope_not_allowed");
  if (!candidate.inShift) reasons.push("out_of_shift");
  if (!candidate.availableForDispatch) reasons.push("dispatch_unavailable");

  if (candidate.presenceStatus !== "available") {
    reasons.push(candidate.presenceStatus);
  }

  if (!candidate.skillAllowed) reasons.push("skill_not_allowed");
  if (!candidate.regionAllowed) reasons.push("region_not_allowed");
  if (!candidate.hasFreshLocation) reasons.push("stale_location");

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}
