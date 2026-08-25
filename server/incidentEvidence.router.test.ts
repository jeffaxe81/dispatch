import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ assertPermission: vi.fn(), assertTeamScope: vi.fn(), getIncidentById: vi.fn(), listIncidentEvidence: vi.fn(), addIncidentEvidence: vi.fn() }));

vi.mock("./accessControl", async importOriginal => ({ ...(await importOriginal<typeof import("./accessControl")>()), assertPermission: mocks.assertPermission, assertTeamScope: mocks.assertTeamScope }));
vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), getIncidentById: mocks.getIncidentById, listIncidentEvidence: mocks.listIncidentEvidence, addIncidentEvidence: mocks.addIncidentEvidence }));

import { appRouter } from "./routers";

function context(teamId: number | null = 3): TrpcContext {
  return { user: { id: 7, openId: "agent-test", name: "Agente", email: "agent@test.local", loginMethod: "test", role: "user", operationalRole: "agente", teamId, active: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function incident(status: "aceita" | "em_atendimento" | "pausada" | "concluida" = "em_atendimento", assignedTeamId = 3) {
  return { incident: { id: 12, code: "OCO-12", status, priority: "alta", category: "Teste", origin: "central", requesterName: null, requesterContact: null, description: "Atendimento de teste", address: "Rua Teste, 1", latitude: "-27.0", longitude: "-48.0", assignedTeamId, assignedVehicleId: null, createdByUserId: 1, closedByUserId: null, dispatchedAt: null, acceptedAt: null, startedAt: null, completedAt: null, cancelledAt: null, closeSummary: null, createdAt: new Date(), updatedAt: new Date() } };
}

const uploadInput = { incidentId: 12, fileName: "registro.pdf", contentType: "application/pdf" as const, description: null, dataBase64: Buffer.from("%PDF-1.7\nconteudo").toString("base64") };

describe("procedures de evidência", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.assertPermission.mockResolvedValue(undefined); mocks.assertTeamScope.mockResolvedValue(undefined); mocks.getIncidentById.mockResolvedValue(incident()); mocks.listIncidentEvidence.mockResolvedValue([]); mocks.addIncidentEvidence.mockResolvedValue({ id: 1, fileName: "registro.pdf" }); });

  it("lista e envia evidência para agente da equipe em atendimento ativo", async () => {
    const caller = appRouter.createCaller(context());
    await caller.incidents.evidence.list({ incidentId: 12 });
    await caller.incidents.evidence.upload(uploadInput);
    expect(mocks.listIncidentEvidence).toHaveBeenCalledWith(12);
    expect(mocks.addIncidentEvidence).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 12, actorUserId: 7, teamId: 3 }));
  });

  it("bloqueia evidência de ocorrência atribuída a outra equipe", async () => {
    mocks.getIncidentById.mockResolvedValue(incident("em_atendimento", 4));
    await expect(appRouter.createCaller(context()).incidents.evidence.upload(uploadInput)).rejects.toBeInstanceOf(TRPCError);
    expect(mocks.addIncidentEvidence).not.toHaveBeenCalled();
  });

  it("bloqueia evidência depois da conclusão e para agente sem equipe", async () => {
    mocks.getIncidentById.mockResolvedValue(incident("concluida", 3));
    await expect(appRouter.createCaller(context()).incidents.evidence.upload(uploadInput)).rejects.toBeInstanceOf(TRPCError);
    mocks.getIncidentById.mockResolvedValue(incident());
    await expect(appRouter.createCaller(context(null)).incidents.evidence.upload(uploadInput)).rejects.toBeInstanceOf(TRPCError);
  });
});
