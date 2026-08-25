import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  assertSuperAdministrator: vi.fn(),
  resolveAuthorizedTeamFilter: vi.fn(),
  getDashboardData: vi.fn(),
  createIncident: vi.fn(),
  listIncidents: vi.fn(),
  createTeam: vi.fn(),
  createVehicle: vi.fn(),
  listOperationLogs: vi.fn(),
  listUsersForAdministration: vi.fn(),
  listUsersWithAccess: vi.fn(),
  createAccessPermission: vi.fn(),
  createAccessRole: vi.fn(),
  getOperationalMapSettings: vi.fn(),
  updateGeneralMapSettings: vi.fn(),
  listExternalIncidentReviews: vi.fn(),
  confirmExternalIncidentReview: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
  assertSuperAdministrator: mocks.assertSuperAdministrator,
  resolveAuthorizedTeamFilter: mocks.resolveAuthorizedTeamFilter,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDashboardData: mocks.getDashboardData,
  createIncident: mocks.createIncident,
  listIncidents: mocks.listIncidents,
  createTeam: mocks.createTeam,
  createVehicle: mocks.createVehicle,
  listOperationLogs: mocks.listOperationLogs,
  listUsersForAdministration: mocks.listUsersForAdministration,
  listUsersWithAccess: mocks.listUsersWithAccess,
  createAccessPermission: mocks.createAccessPermission,
  createAccessRole: mocks.createAccessRole,
  getOperationalMapSettings: mocks.getOperationalMapSettings,
  updateGeneralMapSettings: mocks.updateGeneralMapSettings,
  listExternalIncidentReviews: mocks.listExternalIncidentReviews,
  confirmExternalIncidentReview: mocks.confirmExternalIncidentReview,
}));

import { appRouter } from "./routers";

function context(active = true): TrpcContext {
  return {
    user: {
      id: 901,
      openId: "homologacao-controlada",
      name: "Homologação Controlada",
      email: "homologacao@example.invalid",
      loginMethod: "test",
      role: "admin",
      operationalRole: "administrador",
      teamId: null,
      active,
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
      updatedAt: new Date("2026-08-21T00:00:00.000Z"),
      lastSignedIn: new Date("2026-08-21T00:00:00.000Z"),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("matriz controlada de homologação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.assertSuperAdministrator.mockResolvedValue(undefined);
    mocks.resolveAuthorizedTeamFilter.mockImplementation(async (user: unknown, teamId: number | undefined, permission: string) => { await mocks.assertPermission(user, permission); return teamId; });
    mocks.getDashboardData.mockResolvedValue({ counters: {}, queue: [], teams: [], map: { incidents: [], teams: [] } });
    mocks.createIncident.mockResolvedValue({ id: 41, code: "HOMOLOG-41" });
    mocks.listIncidents.mockResolvedValue({ rows: [{ incident: { code: "HOMOLOG-41", status: "triagem", priority: "alta", category: "Teste controlado", address: "Endereço sintético", createdAt: new Date("2026-08-21T00:00:00.000Z") }, teamCode: "EQ-H" }], total: 1 });
    mocks.createTeam.mockResolvedValue({ id: 71, code: "EQ-H" });
    mocks.createVehicle.mockResolvedValue({ id: 81, prefix: "VTR-H" });
    mocks.listOperationLogs.mockResolvedValue({ rows: [], total: 0 });
    mocks.listUsersForAdministration.mockResolvedValue([]);
    mocks.listUsersWithAccess.mockResolvedValue({ rows: [], total: 0 });
    mocks.createAccessPermission.mockResolvedValue({ id: 11, code: "homologacao.executar" });
    mocks.createAccessRole.mockResolvedValue({ id: 12, code: "homologacao_controlada" });
    mocks.getOperationalMapSettings.mockResolvedValue({ centerLatitude: -27.0976, centerLongitude: -48.9104, defaultZoom: 13, mapType: "roadmap", trafficEnabled: true, autoFitEnabled: true, fallbackMode: "automatic" });
    mocks.updateGeneralMapSettings.mockResolvedValue({ success: true });
    mocks.listExternalIncidentReviews.mockResolvedValue([{ review: { id: 77, status: "pendente" }, workflowName: "ALRT" }]);
    mocks.confirmExternalIncidentReview.mockResolvedValue({ reviewId: 77, incident: { id: 88, code: "HML-88" } });
  });

  it("simula a cadeia administrativa de painel, ocorrência, equipe, viatura, auditoria e exportação sem persistência", async () => {
    const caller = appRouter.createCaller(context());

    await caller.dashboard.summary();
    const incident = await caller.incidents.create({ category: "Teste controlado", priority: "alta", origin: "central", description: "Ocorrência sintética para homologação.", address: "Endereço sintético", latitude: -27.1, longitude: -48.9 });
    await caller.teams.create({ code: "EQ-H", name: "Equipe de Homologação", agency: "AXE Sistemas" });
    await caller.vehicles.create({ prefix: "VTR-H", licensePlate: "HOM0L01", type: "Viatura" });
    await caller.audit.operations({ page: 1, pageSize: 25 });
    const exported = await caller.incidents.export({});

    expect(incident).toEqual({ id: 41, code: "HOMOLOG-41" });
    expect(exported).toEqual([{ codigo: "HOMOLOG-41", situacao: "triagem", prioridade: "alta", tipificacao: "Teste controlado", endereco: "Endereço sintético", equipe: "EQ-H", criadoEm: "2026-08-21T00:00:00.000Z" }]);
    expect(mocks.assertPermission.mock.calls.map(([, permission]) => permission)).toEqual(expect.arrayContaining(["occurrences.view", "occurrences.create", "teams.manage", "vehicles.manage", "audit.view", "reports.export"]));
    expect(mocks.createIncident).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 901 }));
    expect(mocks.createTeam).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 901 }));
    expect(mocks.createVehicle).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 901 }));
  });

  it("simula a administração de usuários, acessos e catálogo local de permissões", async () => {
    const caller = appRouter.createCaller(context());

    await caller.administration.users();
    await caller.access.users({ page: 1, pageSize: 25 });
    await caller.access.createPermission({ code: "homologacao.executar", resource: "homologacao", action: "executar", description: "Permissão sintética." });
    await caller.access.createRole({ code: "homologacao_controlada", name: "Homologação controlada", defaultScope: "global", permissionIds: [11] });

    expect(mocks.assertPermission.mock.calls.map(([, permission]) => permission)).toEqual(["users.view", "users.view", "roles.create", "roles.create"]);
    expect(mocks.createAccessPermission).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 901, code: "homologacao.executar" }));
    expect(mocks.createAccessRole).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 901, code: "homologacao_controlada" }));
  });

  it("protege configurações globais por Super Administrador e preserva a auditoria no escritor", async () => {
    const caller = appRouter.createCaller(context());

    await caller.settings.generalMap();
    await caller.settings.updateGeneralMap({ centerLatitude: -27.0976, centerLongitude: -48.9104, defaultZoom: 13, mapType: "roadmap", trafficEnabled: true, autoFitEnabled: true, fallbackMode: "automatic" });

    expect(mocks.assertSuperAdministrator).toHaveBeenCalledTimes(2);
    expect(mocks.updateGeneralMapSettings).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 901, fallbackMode: "automatic" }));
  });

  it("exige a permissão de ocorrência para confirmar uma prévia externa", async () => {
    const caller = appRouter.createCaller(context());

    await expect(caller.integrations.externalReviews.list()).resolves.toEqual([{ review: { id: 77, status: "pendente" }, workflowName: "ALRT" }]);
    await expect(caller.integrations.externalReviews.confirm({ reviewId: 77 })).resolves.toEqual({ reviewId: 77, incident: { id: 88, code: "HML-88" } });

    expect(mocks.assertPermission.mock.calls.map(([, permission]) => permission)).toEqual(["integrations.view", "occurrences.create"]);
    expect(mocks.confirmExternalIncidentReview).toHaveBeenCalledWith({ reviewId: 77, actorUserId: 901 });
  });

  it("bloqueia toda procedure operacional para uma conta inativa antes de qualquer consulta", async () => {
    await expect(appRouter.createCaller(context(false)).dashboard.summary()).rejects.toMatchObject({ code: "FORBIDDEN", message: "Usuário operacional inativo." } satisfies Partial<TRPCError>);
    expect(mocks.getDashboardData).not.toHaveBeenCalled();
  });
});
