import type { CandidateTeamPoint } from "./gisService";
import {
  evaluateDispatchTeamEligibility,
  partitionDispatchCandidatesByEligibility,
  resolveDispatchMemberEligibility,
  type DispatchMemberPlanningSnapshot,
  type DispatchMemberSessionSnapshot,
} from "./dispatchEligibilityService";

export type DispatchEligibilityTeamMember = {
  userId: number;
  teamId: number;
  active: boolean;
};

export type DispatchEligibilityRuntimeDependencies = {
  loadTeamMembers(teamId: number): Promise<DispatchEligibilityTeamMember[]>;
  loadCurrentSession(userId: number): Promise<DispatchMemberSessionSnapshot | null>;
  resolvePlanning(userId: number, instant: Date): Promise<DispatchMemberPlanningSnapshot | null>;
};

export function createDispatchEligibilityRuntime(dependencies: DispatchEligibilityRuntimeDependencies) {
  return {
    async evaluateCandidates(candidates: CandidateTeamPoint[], instant: Date) {
      if (Number.isNaN(instant.getTime())) throw new Error("instant inválido");

      const teams = await Promise.all(candidates.map(async candidate => {
        const members = await dependencies.loadTeamMembers(candidate.teamId);
        const evaluatedMembers = await Promise.all(members.map(async member => {
          const planning = await dependencies.resolvePlanning(member.userId, instant);
          const session = await dependencies.loadCurrentSession(member.userId);
          return resolveDispatchMemberEligibility({
            userId: member.userId,
            teamId: candidate.teamId,
            active: member.active,
            isTeamMember: member.teamId === candidate.teamId,
            planning,
            session,
          });
        }));
        return evaluateDispatchTeamEligibility(candidate, evaluatedMembers);
      }));

      return {
        ...partitionDispatchCandidatesByEligibility(teams),
        evaluatedAt: instant,
      };
    },
  };
}
