import type {
  DispatchEligibilityPartition,
  DispatchMemberEligibility,
  DispatchTeamEligibility,
} from "../shared/dispatchEligibility";

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
