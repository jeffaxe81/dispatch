import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  assertTeamScope: vi.fn(),
  getAccessSnapshot: vi.fn(),
  getIncidentById: vi.fn(),
  getIncidentAudit: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
  assertTeamScope: mocks.assertTeamScope,
  getAccessSnapshot: mocks.getAccessSnapshot,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getIncidentById: mocks.getIncidentById,
  getIncidentAudit: mocks.getIncidentAudit,
}));

import { appRouter } from "./routers";

function context(role: "administrador" | "agente", teamId: number | null): TrpcContext {
  return {
    user: {
      id: role === "administrador" ? 1 : 7,
      openId: `audit-${role}`,
      name: role,
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

describe("auditoria de ocorrências — isolamento por equipe e tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.assertTeamScope.mockResolvedValue(undefined);
    mocks.getAccessSnapshot.mockResolvedValue({ assignments: [], permissions: new Set(["audit.view"]) });
    mocks.getIncidentAudit.mockResolvedValue([{ id: 1, action: "dispatch" }]);
    mocks.getIncidentById.mockResolvedValue({
      incident: { id: 42, assignedTeamId: 9 },
    });
  });

  it("autoriza somente depois de conferir permissão e escopo da ocorrência", async () => {
    const auditor = appRouter.createCaller(context("administrador", null));
    const result = await auditor.incidents.audit({ incidentId: 42 });

    expect(result).toEqual([{ id: 1, action: "dispatch" }]);
    expect(mocks.assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }), "audit.view",
    );
    expect(mocks.assertTeamScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }), 9, "audit.view",
    );
    expect(mocks.getIncidentAudit).toHaveBeenCalledWith(42);
  });

  it("nega consulta entre equipes mesmo que o serviço de escopo seja permissivo", async () => {
    const agent = appRouter.createCaller(context("agente", 3));
    await expect(agent.incidents.audit({ incidentId: 42 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });

  it("nega acesso quando o escopo dinâmico barra outra organização", async () => {
    mocks.assertTeamScope.mockRejectedValueOnce(
      new TRPCError({ code: "FORBIDDEN", message: "Organização não autorizada" }),
    );
    const auditor = appRouter.createCaller(context("administrador", null));

    await expect(auditor.incidents.audit({ incidentId: 42 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });

  it("nega auditoria de ocorrência sem equipe a agente de campo", async () => {
    mocks.getIncidentById.mockResolvedValueOnce({
      incident: { id: 42, assignedTeamId: null },
    });
    const agent = appRouter.createCaller(context("agente", 3));

    await expect(agent.incidents.audit({ incidentId: 42 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });

  it("nega auditoria sem equipe a usuário com escopo de organização", async () => {
    mocks.getIncidentById.mockResolvedValueOnce({ incident: { id: 42, assignedTeamId: null } });
    mocks.getAccessSnapshot.mockResolvedValueOnce({
      assignments: [{ defaultScope: "organizacao", roleCode: "auditor", organizationId: 7, organizationalUnitId: null, teamId: null }],
      permissions: new Set(["audit.view"]),
    });
    const auditor = appRouter.createCaller(context("administrador", null));

    await expect(auditor.incidents.audit({ incidentId: 42 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getAccessSnapshot).toHaveBeenCalledWith(1);
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });

  it("nega papéis mistos global + organização na auditoria sem equipe", async () => {
    mocks.getIncidentById.mockResolvedValueOnce({ incident: { id: 42, assignedTeamId: null } });
    mocks.getAccessSnapshot.mockResolvedValueOnce({
      assignments: [
        { defaultScope: "global", roleCode: "leitor", organizationId: null, organizationalUnitId: null, teamId: null },
        { defaultScope: "organizacao", roleCode: "auditor", organizationId: 7, organizationalUnitId: null, teamId: null },
      ],
      permissions: new Set(["audit.view"]),
    });
    const auditor = appRouter.createCaller(context("administrador", null));

    await expect(auditor.incidents.audit({ incidentId: 42 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });

  it("autoriza auditoria sem equipe a papel exclusivamente global", async () => {
    mocks.getIncidentById.mockResolvedValueOnce({ incident: { id: 42, assignedTeamId: null } });
    mocks.getAccessSnapshot.mockResolvedValueOnce({
      assignments: [{ defaultScope: "global", roleCode: "auditor", organizationId: null, organizationalUnitId: null, teamId: null }],
      permissions: new Set(["audit.view"]),
    });
    const auditor = appRouter.createCaller(context("administrador", null));

    await expect(auditor.incidents.audit({ incidentId: 42 })).resolves.toEqual([
      { id: 1, action: "dispatch" },
    ]);
    expect(mocks.getAccessSnapshot).toHaveBeenCalledWith(1);
  });

  it("não consulta auditoria para ocorrência inexistente", async () => {
    mocks.getIncidentById.mockResolvedValueOnce(null);
    const auditor = appRouter.createCaller(context("administrador", null));

    await expect(auditor.incidents.audit({ incidentId: 42 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });
});
