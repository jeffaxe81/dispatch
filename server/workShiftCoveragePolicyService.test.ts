import { describe, expect, it } from "vitest";
import type { DispatchMemberEligibility } from "../shared/dispatchEligibility";
import type { CoveragePolicy } from "../shared/workShiftOperations";
import { evaluateCoverage } from "./workShiftCoveragePolicyService";

const policy: CoveragePolicy = {
  id: 1,
  organizationId: 10,
  organizationalUnitId: 20,
  teamId: 30,
  startsAtMinute: 0,
  endsAtMinute: 1440,
  minimumEligible: 2,
  active: true,
};

function member(userId: number, eligible: boolean): DispatchMemberEligibility {
  return {
    userId,
    teamId: 30,
    eligible,
    plannedStartAt: null,
    plannedEndAt: null,
    sessionId: null,
  };
}

describe("evaluateCoverage", () => {
  it("classifica NORMAL quando o mínimo de elegíveis é atendido", () => {
    expect(evaluateCoverage(policy, [member(1, true), member(2, true)])).toEqual({
      state: "NORMAL",
      minimumEligible: 2,
      eligibleCount: 2,
      deficit: 0,
    });
  });

  it("classifica DEGRADED quando existe capacidade abaixo do mínimo", () => {
    expect(evaluateCoverage(policy, [member(1, true), member(2, false)])).toEqual({
      state: "DEGRADED",
      minimumEligible: 2,
      eligibleCount: 1,
      deficit: 1,
    });
  });

  it("classifica CRITICAL quando não existe integrante elegível", () => {
    expect(evaluateCoverage(policy, [member(1, false), member(2, false)])).toEqual({
      state: "CRITICAL",
      minimumEligible: 2,
      eligibleCount: 0,
      deficit: 2,
    });
  });

  it("rejeita mínimo negativo", () => {
    expect(() => evaluateCoverage({ ...policy, minimumEligible: -1 }, [])).toThrow(
      "Cobertura mínima inválida.",
    );
  });

  it("rejeita integrantes de outra equipe quando a política é específica por equipe", () => {
    const wrongTeam = { ...member(1, true), teamId: 99 };
    expect(() => evaluateCoverage(policy, [wrongTeam])).toThrow("Integrante fora do escopo da política.");
  });
});
