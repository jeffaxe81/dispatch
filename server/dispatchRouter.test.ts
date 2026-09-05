import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { CandidateTeamPoint } from "./gisService";

const accessMocks = vi.hoisted(() => ({
  assertPermission: vi.fn(async () => undefined),
  assertTeamScope: vi.fn(async () => undefined),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: accessMocks.assertPermission,
  assertTeamScope: accessMocks.assertTeamScope,
}));

import { createDispatchRouter } from "./dispatchRouter";

const instant = new Date("2026-09-05T12:00:00.000Z");

function context(active = true): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "dispatcher",
      name: "Despachador",
      email: "dispatcher@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "despachador",
      teamId: null,
      active,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function candidate(teamId: number, latitude: number): CandidateTeamPoint {
  return {
    teamId,
    code: `EQ-${teamId}`,
    name: `Equipe ${teamId}`,
    status: "disponivel",
    position: { latitude, longitude: -48.91 },
  };
}

function makeDeps() {
  const routeProvider = {
    name: "test",
    calculateRoute: vi.fn(async () => ({
      distanceMeters: 1000,
      durationSeconds: 300,
      geometry: { type: "LineString" as const, coordinates: [[-48.91, -27.1], [-48.9, -27.2]] as [number, number][] },
      provider: "test",
    })),
  };
  return {
    now: vi.fn(() => instant),
    routeProvider,
    evaluateCandidates: vi.fn(async (candidates: CandidateTeamPoint[], evaluatedAt: Date) => ({
      eligibleCandidates: candidates.filter(item => item.teamId === 10),
      ineligibleCandidates: candidates.filter(item => item.teamId !== 10).map(item => ({
        candidate: item,
        eligible: false,
        eligibleMembers: [],
        ineligibleMembers: [],
      })),
      evaluatedAt,
    })),
  };
}

const incident = { latitude: -27.2, longitude: -48.9 };
const candidates = [candidate(10, -27.1), candidate(11, -27.3)];

describe("D-007C dispatch router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige dispatch.view do usuário autenticado e ativo", async () => {
    const deps = makeDeps();
    const caller = createDispatchRouter(deps).createCaller(context());

    await caller.rankEligibleCandidates({ incident, candidates });

    expect(accessMocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7, active: true }), "dispatch.view");
  });

  it("rejeita equipe fora do escopo antes da elegibilidade e do GIS", async () => {
    accessMocks.assertTeamScope.mockImplementationOnce(async () => {
      throw new Error("team out of scope");
    });
    const deps = makeDeps();
    const caller = createDispatchRouter(deps).createCaller(context());

    await expect(caller.rankEligibleCandidates({ incident, candidates })).rejects.toThrow("team out of scope");
    expect(deps.evaluateCandidates).not.toHaveBeenCalled();
    expect(deps.routeProvider.calculateRoute).not.toHaveBeenCalled();
  });

  it("avalia jornada antes do ranking e envia ao GIS somente candidatos elegíveis", async () => {
    const deps = makeDeps();
    const caller = createDispatchRouter(deps).createCaller(context());

    const result = await caller.rankEligibleCandidates({ incident, candidates });

    expect(accessMocks.assertTeamScope).toHaveBeenCalledTimes(2);
    expect(deps.evaluateCandidates).toHaveBeenCalledWith(candidates, instant);
    expect(deps.routeProvider.calculateRoute).toHaveBeenCalledTimes(1);
    expect(deps.routeProvider.calculateRoute).toHaveBeenCalledWith(expect.objectContaining({ origin: candidates[0].position, destination: incident }));
    expect(result.rankedCandidates.map(item => item.teamId)).toEqual([10]);
    expect(result.ineligibleCandidates.map(item => item.candidate.teamId)).toEqual([11]);
    expect(result.evaluatedAt).toEqual(instant);
  });

  it("não chama o route provider quando nenhuma equipe é elegível", async () => {
    const deps = makeDeps();
    deps.evaluateCandidates.mockResolvedValueOnce({
      eligibleCandidates: [],
      ineligibleCandidates: candidates.map(item => ({ candidate: item, eligible: false, eligibleMembers: [], ineligibleMembers: [] })),
      evaluatedAt: instant,
    });
    const caller = createDispatchRouter(deps).createCaller(context());

    const result = await caller.rankEligibleCandidates({ incident, candidates });

    expect(deps.routeProvider.calculateRoute).not.toHaveBeenCalled();
    expect(result.rankedCandidates).toEqual([]);
  });

  it("preserva candidato elegível com routeError quando o provedor de rotas falha", async () => {
    const deps = makeDeps();
    deps.routeProvider.calculateRoute.mockRejectedValueOnce(new Error("OSRM unavailable"));
    const caller = createDispatchRouter(deps).createCaller(context());

    const result = await caller.rankEligibleCandidates({ incident, candidates });

    expect(result.rankedCandidates).toEqual([
      expect.objectContaining({ teamId: 10, routeError: "OSRM unavailable" }),
    ]);
  });
});
