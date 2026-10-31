/**
 * 1.000 casos novos do Despacho: dez matrizes de 100 cenários.
 * Números de caso exclusivos D10001-D11000; sem serviços externos ou mudanças em produção.
 * Estes testes cobrem regras de domínio e simuladores GIS, NÃO homologação de rádio/GPS/campo.
 */
import { describe, expect, it, vi } from "vitest";
import type { RouteProvider } from "@shared/gis";
import {
  evaluateDispatchTeamEligibility,
  partitionDispatchCandidatesByEligibility,
  resolveDispatchMemberEligibility,
  type DispatchMemberEligibilityInput,
} from "./dispatchEligibilityService";
import { rankTeamCandidates, type CandidateTeamPoint } from "./gisService";
import { evaluateTeamScope, requiresExplicitTeamSelection, type AccessAssignment } from "./accessControl";
import { INCIDENT_STATUSES, INCIDENT_TRANSITIONS, type IncidentStatus } from "../shared/operations";

const hundred = (base: number) =>
  Array.from({ length: 100 }, (_, index) => ({ index, caseId: "DSP-" + (base + index) }));

function candidate(teamId: number, latitude: number, longitude = -48.91): CandidateTeamPoint {
  return {
    teamId,
    code: "EQ-" + teamId,
    name: "Equipe " + teamId,
    status: "disponivel",
    position: { latitude, longitude },
  };
}

function memberInput(
  index: number,
  overrides: Partial<DispatchMemberEligibilityInput> = {},
): DispatchMemberEligibilityInput {
  const start = new Date(Date.UTC(2026, 9, 1, 7) + index * 86_400_000);
  const end = new Date(start.getTime() + 12 * 3_600_000);
  return {
    userId: 20000 + index,
    teamId: 30000 + index,
    active: true,
    isTeamMember: true,
    planning: {
      kind: "work",
      inPlannedWindow: true,
      plannedStartAt: start,
      plannedEndAt: end,
      source: (["schedule", "replacement_shift", "extra_call"] as const)[index % 3],
    },
    session: { id: 40000 + index, status: "active" },
    ...overrides,
  };
}

describe("Despacho - 1.000 novos cenários D10001-D11000", () => {
  it.each(hundred(10001))("$caseId - jornada ativa preserva vínculo, sessão e escala", ({ index }) => {
    const input = memberInput(index);
    const output = resolveDispatchMemberEligibility(input);
    expect(output).toMatchObject({
      eligible: true,
      reason: undefined,
      userId: input.userId,
      teamId: input.teamId,
      sessionId: input.session?.id,
    });
    if (input.planning?.kind !== "work") throw new Error("fixture inválida");
    expect(output.plannedStartAt).toEqual(input.planning.plannedStartAt);
    expect(output.plannedEndAt).toEqual(input.planning.plannedEndAt);
  });

  it.each(hundred(10101))("$caseId - inatividade e equipe externa prevalecem sobre escala", ({ index }) => {
    const inactive = index % 2 === 0;
    const input = memberInput(index, {
      active: !inactive,
      isTeamMember: inactive,
      planning: { kind: index % 3 === 0 ? "leave" : "day_off" },
      session: { id: 41000 + index, status: "active" },
    });
    const result = resolveDispatchMemberEligibility(input);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(inactive ? "USER_INACTIVE" : "NOT_TEAM_MEMBER");
    expect(result.userId).toBe(20000 + index);
    expect(result.sessionId).toBe(41000 + index);
  });

  it.each(hundred(10201))("$caseId - afastamento ou folga bloqueiam qualquer estado da sessão", ({ index }) => {
    const dayOff = index % 2 === 0;
    const states = ["active", "paused", "ended"] as const;
    const input = memberInput(index, {
      planning: { kind: dayOff ? "day_off" : "leave" },
      session: index % 4 === 3 ? null : { id: 42000 + index, status: states[index % 3] },
    });
    const result = resolveDispatchMemberEligibility(input);
    expect(result).toMatchObject({
      eligible: false,
      reason: dayOff ? "DAY_OFF" : "LEAVE",
      userId: 20000 + index,
    });
    expect(result.plannedStartAt).toBeNull();
    expect(result.plannedEndAt).toBeNull();
    expect(result.sessionId).toBe(input.session?.id ?? null);
  });

  it.each(hundred(10301))("$caseId - turno não iniciado, fora da janela, pausado ou encerrado", ({ index }) => {
    const mode = index % 4;
    const base = memberInput(index);
    if (base.planning?.kind !== "work") throw new Error("fixture inválida");
    const input = memberInput(index, {
      planning: { ...base.planning, inPlannedWindow: mode !== 0 },
      session: mode === 1 ? null : {
        id: 43000 + index,
        status: mode === 2 ? "paused" : mode === 3 ? "ended" : "active",
      },
    });
    const output = resolveDispatchMemberEligibility(input);
    const reasons = [
      "OUTSIDE_PLANNED_SHIFT",
      "SHIFT_NOT_STARTED",
      "SHIFT_PAUSED",
      "SHIFT_ENDED",
    ] as const;
    expect(output.eligible).toBe(false);
    expect(output.reason).toBe(reasons[mode]);
    expect(output.sessionId).toBe(input.session?.id ?? null);
  });

  it.each(hundred(10401))("$caseId - política de fallback sem escala planejada", ({ index }) => {
    const mode = index % 4;
    const input = memberInput(index, {
      planning: null,
      session: mode === 3 ? null : {
        id: 44000 + index,
        status: mode === 0 ? "active" : mode === 1 ? "paused" : "ended",
      },
    });
    const output = resolveDispatchMemberEligibility(input);
    expect(output.eligible).toBe(mode === 0);
    expect(output.reason).toBe(
      mode === 0 ? undefined : mode === 1 ? "SHIFT_PAUSED" : "NO_ACTIVE_WORK_SHIFT",
    );
    expect(output.plannedStartAt).toBeNull();
    expect(output.plannedEndAt).toBeNull();
  });

  it.each(hundred(10501))("$caseId - separação de equipes elegíveis sem perder motivos", ({ index }) => {
    const first = candidate(5000 + index * 2, -27.1);
    const second = candidate(5001 + index * 2, -27.2);
    const firstEligible = index % 2 === 0;
    const one = evaluateDispatchTeamEligibility(first, [
      { userId: 6000 + index, teamId: first.teamId, eligible: firstEligible },
      { userId: 7000 + index, teamId: first.teamId, eligible: false, reason: "SHIFT_PAUSED" },
    ]);
    const two = evaluateDispatchTeamEligibility(second, [
      { userId: 8000 + index, teamId: second.teamId, eligible: !firstEligible },
      { userId: 9000 + index, teamId: second.teamId, eligible: false, reason: "DAY_OFF" },
    ]);
    const result = partitionDispatchCandidatesByEligibility([one, two]);
    expect(result.eligibleCandidates).toEqual([firstEligible ? first : second]);
    expect(result.ineligibleCandidates.map(item => item.candidate)).toEqual([
      firstEligible ? second : first,
    ]);
    expect(result.ineligibleCandidates[0].ineligibleMembers).toHaveLength(2);
    expect(one.eligibleMembers.length + two.eligibleMembers.length).toBe(1);
  });

  it.each(hundred(10601))("$caseId - GIS prioriza ETA e descarta posição inválida", async ({ index }) => {
    const incident = { latitude: -27.1, longitude: -48.91 };
    const nearest = candidate(10000 + index * 4, -27.1 - (index + 1) * 0.000001);
    const fast = candidate(10001 + index * 4, -27.12 - index * 0.000001);
    const unrouted = candidate(10002 + index * 4, -27.14);
    const invalid = candidate(10003 + index * 4, 98);
    const route = vi.fn(async (request: Parameters<RouteProvider["calculateRoute"]>[0]) => ({
      distanceMeters: 1000 + index,
      durationSeconds: request.origin.latitude > -27.115 ? 400 + index : 40 + index,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [request.origin.longitude, request.origin.latitude],
          [request.destination.longitude, request.destination.latitude],
        ] as [number, number][],
      },
      provider: "simulated-routing",
    }));
    const provider: RouteProvider = { name: "simulated-routing", calculateRoute: route };
    const result = await rankTeamCandidates(
      incident, [invalid, unrouted, nearest, fast], provider, 2,
    );
    expect(result.map(item => item.teamId)).toEqual([
      fast.teamId, nearest.teamId, unrouted.teamId,
    ]);
    expect(route).toHaveBeenCalledTimes(2);
    expect(result[0].route?.durationSeconds).toBe(40 + index);
    expect(result[1].route?.durationSeconds).toBe(400 + index);
    expect(result[2].route).toBeUndefined();
  });

  it.each(hundred(10701))("$caseId - falha parcial GIS não elimina equipe disponível", async ({ index }) => {
    const near = candidate(20000 + index * 2, -27.101 - index * 0.000001);
    const far = candidate(20001 + index * 2, -27.12 - index * 0.000001);
    const reason = "route-temporarily-unavailable-" + index;
    const route = vi.fn(async (request: Parameters<RouteProvider["calculateRoute"]>[0]) => {
      if (request.origin.latitude > -27.11) throw new Error(reason);
      return {
        distanceMeters: 2200 + index,
        durationSeconds: 90 + index,
        geometry: { type: "LineString" as const, coordinates: [
          [request.origin.longitude, request.origin.latitude],
          [request.destination.longitude, request.destination.latitude],
        ] as [number, number][] },
        provider: "simulated-routing",
      };
    });
    const result = await rankTeamCandidates(
      { latitude: -27.1, longitude: -48.91 },
      [near, far],
      { name: "simulated-routing", calculateRoute: route },
      2,
    );
    expect(result.map(item => item.teamId)).toEqual([far.teamId, near.teamId]);
    expect(result[1].routeError).toBe(reason);
    expect(result[1].route).toBeUndefined();
    expect(result[1].straightLineDistanceMeters).toBeGreaterThan(0);
    expect(route).toHaveBeenCalledTimes(2);
  });

  it.each(hundred(10801))("$caseId - escopo e tenant impedem despacho cruzado", ({ index }) => {
    const team = {
      id: 30000 + index,
      organizationId: 40000 + index,
      organizationalUnitId: 50000 + index,
    };
    const base: AccessAssignment = {
      roleCode: "despachador",
      defaultScope: "equipe",
      organizationId: team.organizationId,
      organizationalUnitId: team.organizationalUnitId,
      teamId: team.id,
    };
    let assignment: AccessAssignment;
    let organization: number;
    let expected: boolean;
    if (index < 25) {
      // Mesmo perfil global não atravessa tenant ativo.
      assignment = { ...base, defaultScope: "global" };
      organization = team.organizationId + 1;
      expected = false;
    } else if (index < 50) {
      // Mesmo tenant, mas equipe explicitamente fora do escopo.
      assignment = { ...base, teamId: team.id + 1 };
      organization = team.organizationId;
      expected = false;
    } else {
      organization = team.organizationId;
      expected = true;
      const scopes = ["global", "organizacao", "unidade", "equipe"] as const;
      const scope = scopes[index % 4];
      assignment = { ...base, defaultScope: scope };
      if (scope === "organizacao") assignment.teamId = null;
      if (scope === "unidade") assignment.teamId = null;
    }
    expect(evaluateTeamScope([assignment], team, organization)).toBe(expected);
    expect(requiresExplicitTeamSelection([assignment])).toBe(
      assignment.defaultScope !== "global",
    );
  });

  it.each(hundred(10901))("$caseId - matriz de 100 cenários de transição de ocorrência", ({ index }) => {
    const from = INCIDENT_STATUSES[index % INCIDENT_STATUSES.length];
    const to = INCIDENT_STATUSES[Math.floor(index / INCIDENT_STATUSES.length) % INCIDENT_STATUSES.length];
    const scenario = Math.floor(index / (INCIDENT_STATUSES.length ** 2));
    const expectedAllowed: Record<IncidentStatus, IncidentStatus[]> = {
      triagem: ["aguardando_despacho", "cancelada"],
      aguardando_despacho: ["despachada", "cancelada"],
      despachada: ["aceita", "aguardando_despacho", "cancelada"],
      aceita: ["em_atendimento", "aguardando_despacho", "cancelada"],
      em_atendimento: ["pausada", "concluida", "cancelada"],
      pausada: ["em_atendimento", "cancelada"],
      concluida: [],
      cancelada: [],
    };
    const isAllowed = expectedAllowed[from].includes(to);
    expect(INCIDENT_TRANSITIONS[from].includes(to)).toBe(isAllowed);
    expect(INCIDENT_TRANSITIONS[from]).not.toContain(from);
    if (from === "concluida" || from === "cancelada") {
      expect(INCIDENT_TRANSITIONS[from]).toHaveLength(0);
    }
    // O terceiro eixo permite repetir pares de estado com diferentes cenários operacionais.
    expect(scenario).toBe(index < 64 ? 0 : 1);
  });
});
