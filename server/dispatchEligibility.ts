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

export type DispatchEligibilityReason =
  | "scope_not_allowed"
  | "out_of_shift"
  | "dispatch_disabled"
  | "busy"
  | "paused"
  | "offline"
  | "skill_not_allowed"
  | "region_not_allowed"
  | "stale_location";

export type DispatchEligibilityResult = {
  eligible: boolean;
  reasons: DispatchEligibilityReason[];
};

export function evaluateDispatchEligibility(
  candidate: DispatchEligibilityCandidate,
): DispatchEligibilityResult {
  const reasons: DispatchEligibilityReason[] = [];

  if (!candidate.scopeAllowed) reasons.push("scope_not_allowed");
  if (!candidate.inShift) reasons.push("out_of_shift");
  if (!candidate.availableForDispatch) reasons.push("dispatch_disabled");

  if (candidate.presenceStatus === "busy") reasons.push("busy");
  if (candidate.presenceStatus === "paused") reasons.push("paused");
  if (candidate.presenceStatus === "offline") reasons.push("offline");
  if (candidate.presenceStatus === "out_of_shift" && candidate.inShift) {
    reasons.push("out_of_shift");
  }

  if (!candidate.skillAllowed) reasons.push("skill_not_allowed");
  if (!candidate.regionAllowed) reasons.push("region_not_allowed");
  if (!candidate.hasFreshLocation) reasons.push("stale_location");

  return { eligible: reasons.length === 0, reasons };
}
