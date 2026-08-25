import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  assertTeamScope: vi.fn(),
  getIncidentById: vi.fn(),
  transitionIncident: vi.fn(),
  updateTeamShift: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
  assertTeamScope: mocks.assertTeamScope,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getIncidentById: mocks.getIncidentById,
  transitionIncident: mocks.transitionIncident,
  updateTeamShift: mocks.updateTeamShift,
}));

import { appRouter } from "./routers";

function context(role: "despachador" | "agente", teamId: number | null): TrpcContext {
  return {
    user: {
      id: role === "despachador" ? 2 : 7,
      openId: `triage-shift-${role}`,
      name: role === "despachador" ? "Despachador" : "Agente",
      email: `${role}@test.local`,
      loginMethod: "test",
      role: "user",
      operationalRole: role,
      teamId,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const triageIncident = {
  incident: {
    id: 21,
    code: "OCR-2026-TRIAGE",
    status: "triagem" as const,
    priority: "alta" as const,
    category: "Triagem urbana",
    origin: "central" as const,
    requesterName: null,
    requesterContact: null,
    description: "Ocorrência aguardando validação da central.",
    address: "Rua de Teste, 200",
    latitude: "-27.0976000",
    longitude: "-48.9104000",
    assignedTeamId: null,
    assignedVehicleId: null,
    createdByUserId: 1,
    closedByUserId: null,
    dispatchedAt: null,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    closeSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe("triagem e jornada operacional após a migração", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.assertTeamScope.mockResolvedValue(undefined);
    mocks.getIncidentById.mockResolvedValue(triageIncident);
    mocks.transitionIncident.mockResolvedValue({ ...triageIncident.incident, status: "aguardando_despacho" });
    mocks.updateTeamShift.mockResolvedValue(undefined);
  });

  it("encaminha a triagem para despacho e bloqueia conclusão direta", async () => {
    const caller = appRouter.createCaller(context("despachador", null));

    await caller.incidents.transition({ incidentId: 21, nextStatus: "aguardando_despacho", note: "Triagem validada pela central." });

    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ operationalRole: "despachador" }), "occurrences.transition");
    expect(mocks.transitionIncident).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 21, nextStatus: "aguardando_despacho", actorUserId: 2 }));

    mocks.transitionIncident.mockClear();
    await expect(caller.incidents.transition({ incidentId: 21, nextStatus: "concluida", note: "Atalho indevido para encerramento." })).rejects.toBeInstanceOf(TRPCError);
    expect(mocks.transitionIncident).not.toHaveBeenCalled();
  });

  it("registra início, pausa, retorno e fim da jornada somente para a equipe própria", async () => {
    const caller = appRouter.createCaller(context("agente", 3));

    for (const action of ["start", "pause", "resume", "end"] as const) {
      await caller.teams.updateShift({ teamId: 3, action });
    }

    expect(mocks.updateTeamShift).toHaveBeenCalledTimes(4);
    expect(mocks.updateTeamShift).toHaveBeenNthCalledWith(1, { teamId: 3, action: "start", actorUserId: 7 });
    expect(mocks.updateTeamShift).toHaveBeenNthCalledWith(4, { teamId: 3, action: "end", actorUserId: 7 });

    await expect(caller.teams.updateShift({ teamId: 4, action: "start" })).rejects.toBeInstanceOf(TRPCError);
    expect(mocks.updateTeamShift).toHaveBeenCalledTimes(4);
  });
});
