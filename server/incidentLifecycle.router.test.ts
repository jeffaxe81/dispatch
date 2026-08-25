import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  assertTeamScope: vi.fn(),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  getIncidentById: vi.fn(),
  assignTeamToIncident: vi.fn(),
  respondToAssignment: vi.fn(),
  transitionIncident: vi.fn(),
  getIncidentAudit: vi.fn(),
  listOperationLogs: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
  assertTeamScope: mocks.assertTeamScope,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  createIncident: mocks.createIncident,
  updateIncident: mocks.updateIncident,
  getIncidentById: mocks.getIncidentById,
  assignTeamToIncident: mocks.assignTeamToIncident,
  respondToAssignment: mocks.respondToAssignment,
  transitionIncident: mocks.transitionIncident,
  getIncidentAudit: mocks.getIncidentAudit,
  listOperationLogs: mocks.listOperationLogs,
}));

import { appRouter } from "./routers";

type IncidentStatus = "triagem" | "aguardando_despacho" | "despachada" | "aceita" | "em_atendimento" | "concluida";

function context(role: "administrador" | "agente", teamId: number | null, id = role === "administrador" ? 1 : 7): TrpcContext {
  return {
    user: {
      id,
      openId: `lifecycle-${role}`,
      name: role === "administrador" ? "Administrador" : "Agente",
      email: `${role}@test.local`,
      loginMethod: "test",
      role: role === "administrador" ? "admin" : "user",
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

function incident(status: IncidentStatus, assignedTeamId: number | null = status === "triagem" ? null : 3) {
  return {
    incident: {
      id: 12,
      code: "OCR-2026-LIFECYCLE",
      status,
      priority: "alta" as const,
      category: "Atendimento urbano",
      origin: "central" as const,
      requesterName: "Solicitante",
      requesterContact: null,
      description: "Ocorrência usada para validar o ciclo operacional.",
      address: "Rua de Teste, 100",
      latitude: "-27.0976000",
      longitude: "-48.9104000",
      assignedTeamId,
      assignedVehicleId: null,
      createdByUserId: 1,
      closedByUserId: status === "concluida" ? 1 : null,
      dispatchedAt: assignedTeamId ? new Date() : null,
      acceptedAt: ["aceita", "em_atendimento", "concluida"].includes(status) ? new Date() : null,
      startedAt: ["em_atendimento", "concluida"].includes(status) ? new Date() : null,
      completedAt: status === "concluida" ? new Date() : null,
      cancelledAt: null,
      closeSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe("ciclo tRPC de ocorrência e auditoria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.assertTeamScope.mockResolvedValue(undefined);
    mocks.createIncident.mockResolvedValue(incident("triagem").incident);
    mocks.updateIncident.mockResolvedValue(incident("triagem").incident);
    mocks.assignTeamToIncident.mockResolvedValue(incident("despachada").incident);
    mocks.respondToAssignment.mockResolvedValue(incident("aceita").incident);
    mocks.transitionIncident.mockImplementation(async ({ nextStatus }: { nextStatus: IncidentStatus }) => incident(nextStatus).incident);
    mocks.getIncidentAudit.mockResolvedValue([]);
    mocks.listOperationLogs.mockResolvedValue({ rows: [], total: 0 });
  });

  it("valida criação, atualização, despacho, aceite, atendimento, conclusão e consultas de auditoria", async () => {
    mocks.getIncidentById
      .mockResolvedValueOnce(incident("triagem"))
      .mockResolvedValueOnce(incident("aguardando_despacho"))
      .mockResolvedValueOnce(incident("despachada"))
      .mockResolvedValueOnce(incident("aceita"))
      .mockResolvedValueOnce(incident("em_atendimento"));

    const administrator = appRouter.createCaller(context("administrador", null));
    const agent = appRouter.createCaller(context("agente", 3));

    await administrator.incidents.create({
      category: "Atendimento urbano",
      priority: "alta",
      origin: "central",
      requesterName: "Solicitante",
      description: "Queda de árvore bloqueando parcialmente a via.",
      address: "Rua de Teste, 100",
      latitude: -27.0976,
      longitude: -48.9104,
    });
    await administrator.incidents.update({ incidentId: 12, description: "Via totalmente bloqueada após nova avaliação." });
    await administrator.incidents.assign({ incidentId: 12, teamId: 3, estimatedArrivalMinutes: 12 });
    await agent.incidents.respondToAssignment({ incidentId: 12, accepted: true, note: "Equipe em deslocamento." });
    await agent.incidents.transition({ incidentId: 12, nextStatus: "em_atendimento", note: "Equipe no local." });
    await administrator.incidents.transition({ incidentId: 12, nextStatus: "concluida", note: "Via liberada com segurança." });
    await administrator.incidents.audit({ incidentId: 12 });
    await administrator.audit.operations({ page: 1, pageSize: 25, resourceType: "incident" });

    expect(mocks.createIncident).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 1, priority: "alta" }));
    expect(mocks.updateIncident).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 12, actorUserId: 1 }));
    expect(mocks.assignTeamToIncident).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 12, teamId: 3, actorUserId: 1 }));
    expect(mocks.respondToAssignment).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 12, teamId: 3, actorUserId: 7, accepted: true }));
    expect(mocks.transitionIncident).toHaveBeenNthCalledWith(1, expect.objectContaining({ nextStatus: "em_atendimento", actorUserId: 7 }));
    expect(mocks.transitionIncident).toHaveBeenNthCalledWith(2, expect.objectContaining({ nextStatus: "concluida", actorUserId: 1 }));
    expect(mocks.getIncidentAudit).toHaveBeenCalledWith(12);
    expect(mocks.listOperationLogs).toHaveBeenCalledWith({ page: 1, pageSize: 25, resourceType: "incident" });
  });
});
