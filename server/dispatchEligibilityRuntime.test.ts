import { describe, expect, it, vi } from "vitest";
import type { CandidateTeamPoint } from "./gisService";
import {
  createDispatchEligibilityRuntime,
  type DispatchEligibilityRuntimeDependencies,
} from "./dispatchEligibilityRuntime";

const instant = new Date("2026-09-05T12:00:00.000Z");

function candidate(teamId: number): CandidateTeamPoint {
  return {
    teamId,
    code: `EQ-${teamId}`,
    name: `Equipe ${teamId}`,
    status: "disponivel",
    position: { latitude: -27.1, longitude: -48.91 },
  };
}

function dependencies(
  overrides: Partial<DispatchEligibilityRuntimeDependencies> = {},
): DispatchEligibilityRuntimeDependencies {
  return {
    loadTeamMembers: vi.fn(async teamId => [
      { userId: 100 + teamId, teamId, active: true },
    ]),
    loadCurrentSession: vi.fn(async userId => ({ id: 500 + userId, status: "active" as const })),
    resolvePlanning: vi.fn(async () => ({
      kind: "work" as const,
      inPlannedWindow: true,
      plannedStartAt: new Date("2026-09-05T08:00:00.000Z"),
      plannedEndAt: new Date("2026-09-05T20:00:00.000Z"),
      source: "schedule" as const,
    })),
    ...overrides,
  };
}

describe("D-007C dispatch eligibility runtime", () => {
  it("resolve membros no servidor e aprova equipe com membro D-007B em jornada ativa", async () => {
    const deps = dependencies();
    const runtime = createDispatchEligibilityRuntime(deps);

    const result = await runtime.evaluateCandidates([candidate(10)], instant);

    expect(deps.loadTeamMembers).toHaveBeenCalledWith(10);
    expect(deps.resolvePlanning).toHaveBeenCalledWith(110, instant);
    expect(deps.loadCurrentSession).toHaveBeenCalledWith(110);
    expect(result.eligibleCandidates.map(item => item.teamId)).toEqual([10]);
    expect(result.ineligibleCandidates).toEqual([]);
    expect(result.evaluatedAt).toEqual(instant);
  });

  it("mantém compatibilidade com D-007A quando não há planejamento D-007B", async () => {
    const runtime = createDispatchEligibilityRuntime(dependencies({
      resolvePlanning: vi.fn(async () => null),
      loadCurrentSession: vi.fn(async () => ({ id: 701, status: "active" as const })),
    }));

    const result = await runtime.evaluateCandidates([candidate(11)], instant);

    expect(result.eligibleCandidates.map(item => item.teamId)).toEqual([11]);
  });

  it("marca equipe sem membros ativos como inelegível", async () => {
    const runtime = createDispatchEligibilityRuntime(dependencies({
      loadTeamMembers: vi.fn(async () => []),
    }));

    const result = await runtime.evaluateCandidates([candidate(12)], instant);

    expect(result.eligibleCandidates).toEqual([]);
    expect(result.ineligibleCandidates).toHaveLength(1);
    expect(result.ineligibleCandidates[0].candidate.teamId).toBe(12);
  });

  it("falha fechada quando a resolução D-007B apresenta erro técnico", async () => {
    const runtime = createDispatchEligibilityRuntime(dependencies({
      resolvePlanning: vi.fn(async () => {
        throw new Error("planning unavailable");
      }),
    }));

    await expect(runtime.evaluateCandidates([candidate(13)], instant)).rejects.toThrow("planning unavailable");
  });

  it("não aceita associação de membros no candidato e sempre consulta o loader server-side", async () => {
    const loadTeamMembers = vi.fn(async teamId => [
      { userId: 999, teamId, active: true },
    ]);
    const deps = dependencies({ loadTeamMembers });
    const runtime = createDispatchEligibilityRuntime(deps);
    const forged = {
      ...candidate(14),
      members: [{ userId: 1, teamId: 14, active: true }],
    } as CandidateTeamPoint;

    const result = await runtime.evaluateCandidates([forged], instant);

    expect(loadTeamMembers).toHaveBeenCalledWith(14);
    expect(deps.resolvePlanning).toHaveBeenCalledWith(999, instant);
    expect(result.eligibleCandidates[0].teamId).toBe(14);
  });
});
