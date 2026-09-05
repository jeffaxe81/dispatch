import type {
  DispatchEligibilityPartition,
  DispatchEligibilityReason,
  DispatchMemberEligibility,
  DispatchTeamEligibility,
} from "../shared/dispatchEligibility";

export type DispatchMemberPlanningSnapshot =
  | {
      kind: "work";
      inPlannedWindow: boolean;
      plannedStartAt: Date | null;
      plannedEndAt: Date | null;
      source?: "schedule" | "replacement_shift" | "extra_call";
    }
  | { kind: "day_off" }
  | { kind: "leave" };

export type DispatchMemberSessionSnapshot = {
  id: number;
  status: "active" | "paused" | "ended";
};

export type DispatchMemberEligibilityInput = {
  userId: number;
  teamId: number;
  active: boolean;
  isTeamMember: boolean;
  planning: DispatchMemberPlanningSnapshot | null;
  session: DispatchMemberSessionSnapshot | null;
};

function toMemberEligibility(
  input: DispatchMemberEligibilityInput,
  eligible: boolean,
  reason?: DispatchEligibilityReason,
): DispatchMemberEligibility {
  const planning = input.planning?.kind === "work" ? input.planning : null;
  return {
    userId: input.userId,
    teamId: input.teamId,
    eligible,
    reason,
    plannedStartAt: planning?.plannedStartAt ?? null,
    plannedEndAt: planning?.plannedEndAt ?? null,
    sessionId: input.session?.id ?? null,
  };
}

export function resolveDispatchMemberEligibility(
  input: DispatchMemberEligibilityInput,
): DispatchMemberEligibility {
  if (!input.active) return toMemberEligibility(input, false, "USER_INACTIVE");
  if (!input.isTeamMember) return toMemberEligibility(input, false, "NOT_TEAM_MEMBER");

  if (input.planning?.kind === "day_off") {
    return toMemberEligibility(input, false, "DAY_OFF");
  }
  if (input.planning?.kind === "leave") {
    return toMemberEligibility(input, false, "LEAVE");
  }

  if (input.planning?.kind === "work") {
    if (!input.planning.inPlannedWindow) {
      return toMemberEligibility(input, false, "OUTSIDE_PLANNED_SHIFT");
    }
    if (!input.session) {
      return toMemberEligibility(input, false, "SHIFT_NOT_STARTED");
    }
    if (input.session.status === "paused") {
      return toMemberEligibility(input, false, "SHIFT_PAUSED");
    }
    if (input.session.status === "ended") {
      return toMemberEligibility(input, false, "SHIFT_ENDED");
    }
    return toMemberEligibility(input, true);
  }

  if (input.session?.status === "active") {
    return toMemberEligibility(input, true);
  }
  if (input.session?.status === "paused") {
    return toMemberEligibility(input, false, "SHIFT_PAUSED");
  }
  return toMemberEligibility(input, false, "NO_ACTIVE_WORK_SHIFT");
}

export function evaluateDispatchTeamEligibility<TCandidate>(
  candidate: TCandidate,
  members: DispatchMemberEligibility[],
): DispatchTeamEligibility<TCandidate> {
  const eligibleMembers = members.filter(member => member.eligible);
  const ineligibleMembers = members.filter(member => !member.eligible);

  return {
    candidate,
    eligible: eligibleMembers.length > 0,
    eligibleMembers,
    ineligibleMembers,
  };
}

export function partitionDispatchCandidatesByEligibility<TCandidate>(
  teams: DispatchTeamEligibility<TCandidate>[],
): DispatchEligibilityPartition<TCandidate> {
  return {
    eligibleCandidates: teams.filter(team => team.eligible).map(team => team.candidate),
    ineligibleCandidates: teams.filter(team => !team.eligible),
  };
}
