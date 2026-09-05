import { describe, expect, it } from "vitest";
import {
  DISPATCH_ELIGIBILITY_REASONS,
  type DispatchMemberEligibility,
} from "../shared/dispatchEligibility";
import {
  evaluateDispatchTeamEligibility,
  partitionDispatchCandidatesByEligibility,
} from "./dispatchEligibilityService";

type Candidate = {
  teamId: number;
  code: string;
  name: string;
};

function member(
  input: Partial<DispatchMemberEligibility> & Pick<DispatchMemberEligibility, "userId" | "eligible">,
): DispatchMemberEligibility {
  return {
    teamId: 10,
    plannedStartAt: null,
    plannedEndAt: null,
    sessionId: null,
    ...input,
  };
}

const candidate: Candidate = { teamId: 10, code: "EQ-10", name: "Equipe 10" };

describe("D-007C dispatch eligibility domain", () => {
  it("mantém nove razões estáveis de inelegibilidade para consumidores externos", () => {
    expect(DISPATCH_ELIGIBILITY_REASONS).toEqual([
      "OUTSIDE_PLANNED_SHIFT",
      "SHIFT_NOT_STARTED",
      "SHIFT_PAUSED",
      "SHIFT_ENDED",
      "DAY_OFF",
      "LEAVE",
      "NO_ACTIVE_WORK_SHIFT",
      "USER_INACTIVE",
      "NOT_TEAM_MEMBER",
    ]);
  });

  it("mantém a equipe elegível quando ao menos um membro está elegível", () => {
    const result = evaluateDispatchTeamEligibility(candidate, [
      member({ userId: 21, eligible: true }),
      member({ userId: 22, eligible: false, reason: "SHIFT_PAUSED" }),
    ]);

    expect(result.eligible).toBe(true);
    expect(result.eligibleMembers.map(item => item.userId)).toEqual([21]);
    expect(result.ineligibleMembers).toEqual([
      expect.objectContaining({ userId: 22, reason: "SHIFT_PAUSED" }),
    ]);
  });

  it("separa equipes sem membros elegíveis antes de qualquer etapa GIS", () => {
    const team10 = evaluateDispatchTeamEligibility(candidate, [
      member({ userId: 21, eligible: false, reason: "OUTSIDE_PLANNED_SHIFT" }),
    ]);
    const team11Candidate: Candidate = { teamId: 11, code: "EQ-11", name: "Equipe 11" };
    const team11 = evaluateDispatchTeamEligibility(team11Candidate, [
      member({ teamId: 11, userId: 31, eligible: true }),
    ]);

    const partition = partitionDispatchCandidatesByEligibility([team10, team11]);

    expect(partition.eligibleCandidates).toEqual([team11Candidate]);
    expect(partition.ineligibleCandidates).toEqual([team10]);
  });
});
