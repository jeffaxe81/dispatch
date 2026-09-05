export const DISPATCH_ELIGIBILITY_REASONS = [
  "OUTSIDE_PLANNED_SHIFT",
  "SHIFT_NOT_STARTED",
  "SHIFT_PAUSED",
  "SHIFT_ENDED",
  "DAY_OFF",
  "LEAVE",
  "NO_ACTIVE_WORK_SHIFT",
  "USER_INACTIVE",
  "NOT_TEAM_MEMBER",
] as const;

export type DispatchEligibilityReason = (typeof DISPATCH_ELIGIBILITY_REASONS)[number];

export type DispatchMemberEligibility = {
  userId: number;
  teamId: number;
  eligible: boolean;
  reason?: DispatchEligibilityReason;
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  sessionId?: number | null;
};

export type DispatchTeamEligibility<TCandidate> = {
  candidate: TCandidate;
  eligible: boolean;
  eligibleMembers: DispatchMemberEligibility[];
  ineligibleMembers: DispatchMemberEligibility[];
};

export type DispatchEligibilityPartition<TCandidate> = {
  eligibleCandidates: TCandidate[];
  ineligibleCandidates: DispatchTeamEligibility<TCandidate>[];
};
