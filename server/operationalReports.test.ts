import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ assertPermission: vi.fn(), assertTeamScope: vi.fn(), getOperationalReport: vi.fn(), auditOperationalReportExport: vi.fn(), listDashboardSavedFilters: vi.fn(), saveDashboardFilter: vi.fn(), deleteDashboardFilter: vi.fn() }));

vi.mock("./accessControl", async importOriginal => ({ ...(await importOriginal<typeof import("./accessControl")>()), assertPermission: mocks.assertPermission, assertTeamScope: mocks.assertTeamScope, resolveAuthorizedTeamFilter: async (user: unknown, teamId: number | undefined, permission: string) => { await mocks.assertPermission(user, permission); if (teamId) await mocks.assertTeamScope(user, teamId, permission); return teamId; } }));
vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), getOperationalReport: mocks.getOperationalReport, auditOperationalReportExport: mocks.auditOperationalReportExport, listDashboardSavedFilters: mocks.listDashboardSavedFilters, saveDashboardFilter: mocks.saveDashboardFilter, deleteDashboardFilter: mocks.deleteDashboardFilter }));

import { appRouter } from "./routers";

function context(): TrpcContext { return { user: { id: 51, openId: "report-test", name: "Relatórios", email: "reports@example.invalid", loginMethod: "test", role: "admin", operationalRole: "despachador", teamId: null, active: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"] }; }

const report = { generatedAt: new Date("2026-08-21T12:00:00.000Z"), filters: { startDate: null, endDate: null, teamId: 8 }, metrics: { total: 2, active: 1, completed: 1, cancelled: 0, criticalOrHigh: 1, averageResponseMinutes: 12, averageResolutionMinutes: 42 }, byStatus: { triagem: 1, concluida: 1 }, byPriority: { alta: 1, media: 1 }, comparison: { period: { startDate: new Date("2026-07-12T00:00:00.000Z"), endDate: new Date("2026-07-31T23:59:59.000Z"), teamId: 8 }, metrics: { total: 1, active: 1, completed: 0, cancelled: 0, criticalOrHigh: 0, averageResponseMinutes: 10, averageResolutionMinutes: null }, changes: { total: { absolute: 1, percentage: 100 }, active: { absolute: 0, percentage: 0 }, completed: { absolute: 1, percentage: null }, averageResponseMinutes: { absolute: 2, percentage: 20 }, averageResolutionMinutes: null } }, records: [] };

describe("relatórios operacionais", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.assertPermission.mockResolvedValue(undefined); mocks.assertTeamScope.mockResolvedValue(undefined); mocks.getOperationalReport.mockResolvedValue(report); mocks.auditOperationalReportExport.mockResolvedValue(undefined); mocks.listDashboardSavedFilters.mockResolvedValue([{ id: 14, name: "Minha equipe", userId: 51, teamId: 8, startDate: new Date("2026-08-01T00:00:00.000Z"), endDate: new Date("2026-08-21T23:59:59.000Z"), isDefault: true }]); mocks.saveDashboardFilter.mockResolvedValue({ id: 14 }); mocks.deleteDashboardFilter.mockResolvedValue(undefined); });

  it("aplica filtros de período e equipe sob a permissão de visualização", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.reports.overview({ startDate: new Date("2026-08-01T00:00:00.000Z"), endDate: new Date("2026-08-21T23:59:59.000Z"), teamId: 8 });
    expect(result.metrics.total).toBe(2);
    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.anything(), "reports.view");
    expect(mocks.assertTeamScope).toHaveBeenCalledWith(expect.anything(), 8, "reports.view");
    expect(mocks.getOperationalReport).toHaveBeenCalledWith(expect.objectContaining({ teamId: 8 }));
    expect(result.comparison?.changes.total.percentage).toBe(100);
  });

  it("audita cada exportação de PDF ou CSV com o recorte reconsultado", async () => {
    const caller = appRouter.createCaller(context());
    await caller.reports.export({ format: "pdf", teamId: 8 });
    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.anything(), "reports.export");
    expect(mocks.assertTeamScope).toHaveBeenCalledWith(expect.anything(), 8, "reports.export");
    expect(mocks.auditOperationalReportExport).toHaveBeenCalledWith({ actorUserId: 51, format: "pdf", report });
  });

  it("mantém filtros salvos privados e permite salvar, listar e remover somente os próprios registros", async () => {
    const caller = appRouter.createCaller(context());
    const listed = await caller.reports.savedFilters.list();
    await caller.reports.savedFilters.save({ name: "Minha equipe", teamId: 8, isDefault: true });
    await caller.reports.savedFilters.delete({ filterId: 14 });
    expect(listed).toHaveLength(1);
    expect(mocks.listDashboardSavedFilters).toHaveBeenCalledWith(51);
    expect(mocks.saveDashboardFilter).toHaveBeenCalledWith(expect.objectContaining({ userId: 51, teamId: 8, isDefault: true }));
    expect(mocks.deleteDashboardFilter).toHaveBeenCalledWith({ userId: 51, filterId: 14 });
  });
});
