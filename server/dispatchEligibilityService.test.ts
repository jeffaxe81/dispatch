import { describe, expect, it } from "vitest";
import {
  DISPATCH_ELIGIBILITY_REASONS,
  type DispatchMemberEligibility,
} from "../shared/dispatchEligibility";
import {
  evaluateDispatchTeamEligibility,
  partitionDispatchCandidatesByEligibility,
  resolveDispatchMemberEligibility,
  type DispatchMemberEligibilityInput,
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

function individual(
  input: Partial<DispatchMemberEligibilityInput> = {},
): DispatchMemberEligibilityInput {
  return {
    userId: 21,
    teamId: 10,
    active: true,
    isTeamMember: true,
    planning: {
      kind: "work",
      inPlannedWindow: true,
      plannedStartAt: new Date("2026-09-05T08:00:00.000Z"),
      plannedEndAt: new Date("2026-09-05T20:00:00.000Z"),
    },
    session: {
      id: 501,
      status: "active",
    },
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

  it("rejeita usuário inativo antes de avaliar planejamento ou sessão", () => {
    expect(resolveDispatchMemberEligibility(individual({ active: false }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "USER_INACTIVE" }),
    );
  });

  it("rejeita vínculo inválido de equipe", () => {
    expect(resolveDispatchMemberEligibility(individual({ isTeamMember: false }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "NOT_TEAM_MEMBER" }),
    );
  });

  it("distingue folga e afastamento como exceções impeditivas", () => {
    expect(resolveDispatchMemberEligibility(individual({ planning: { kind: "day_off" } }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "DAY_OFF" }),
    );
    expect(resolveDispatchMemberEligibility(individual({ planning: { kind: "leave" } }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "LEAVE" }),
    );
  });

  it("rejeita membro fora da janela planejada", () => {
    expect(resolveDispatchMemberEligibility(individual({
      planning: {
        kind: "work",
        inPlannedWindow: false,
        plannedStartAt: new Date("2026-09-05T08:00:00.000Z"),
        plannedEndAt: new Date("2026-09-05T20:00:00.000Z"),
      },
    }))).toEqual(expect.objectContaining({ eligible: false, reason: "OUTSIDE_PLANNED_SHIFT" }));
  });

  it("exige jornada real iniciada dentro da janela planejada", () => {
    expect(resolveDispatchMemberEligibility(individual({ session: null }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "SHIFT_NOT_STARTED" }),
    );
  });

  it("preserva estados pausado e encerrado", () => {
    expect(resolveDispatchMemberEligibility(individual({ session: { id: 501, status: "paused" } }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "SHIFT_PAUSED", sessionId: 501 }),
    );
    expect(resolveDispatchMemberEligibility(individual({ session: { id: 501, status: "ended" } }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "SHIFT_ENDED", sessionId: 501 }),
    );
  });

  it("mantém membro ativo elegível em janela planejada regular ou extraordinária", () => {
    expect(resolveDispatchMemberEligibility(individual())).toEqual(
      expect.objectContaining({ eligible: true, reason: undefined, sessionId: 501 }),
    );
    expect(resolveDispatchMemberEligibility(individual({
      planning: {
        kind: "work",
        inPlannedWindow: true,
        plannedStartAt: new Date("2026-09-05T22:00:00.000Z"),
        plannedEndAt: new Date("2026-09-06T02:00:00.000Z"),
        source: "extra_call",
      },
    }))).toEqual(expect.objectContaining({ eligible: true }));
    expect(resolveDispatchMemberEligibility(individual({
      planning: {
        kind: "work",
        inPlannedWindow: true,
        plannedStartAt: new Date("2026-09-05T22:00:00.000Z"),
        plannedEndAt: new Date("2026-09-06T02:00:00.000Z"),
        source: "replacement_shift",
      },
    }))).toEqual(expect.objectContaining({ eligible: true }));
  });

  it("mantém compatibilidade D-007A quando não existe planejamento D-007B", () => {
    expect(resolveDispatchMemberEligibility(individual({ planning: null }))).toEqual(
      expect.objectContaining({ eligible: true, sessionId: 501 }),
    );
    expect(resolveDispatchMemberEligibility(individual({ planning: null, session: { id: 501, status: "paused" } }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "SHIFT_PAUSED" }),
    );
    expect(resolveDispatchMemberEligibility(individual({ planning: null, session: null }))).toEqual(
      expect.objectContaining({ eligible: false, reason: "NO_ACTIVE_WORK_SHIFT" }),
    );
  });
});
