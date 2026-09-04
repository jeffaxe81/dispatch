import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  getOwnCurrentWorkShift: vi.fn(),
  listOwnWorkShiftHistory: vi.fn(),
  controlOwnWorkShift: vi.fn(),
  legacyControlOwnWorkShift: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getOwnCurrentWorkShift: mocks.getOwnCurrentWorkShift,
  listOwnWorkShiftHistory: mocks.listOwnWorkShiftHistory,
  controlOwnWorkShift: mocks.legacyControlOwnWorkShift,
}));

vi.mock("./workShiftControlDb", () => ({
  controlOwnWorkShiftWithPlanning: mocks.controlOwnWorkShift,
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "work-shift-agent",
      name: "Agente Jornada",
      email: "agente.jornada@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "agente",
      teamId: 3,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("workShifts router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.getOwnCurrentWorkShift.mockResolvedValue(null);
    mocks.listOwnWorkShiftHistory.mockResolvedValue({ rows: [], total: 0 });
    mocks.controlOwnWorkShift.mockResolvedValue({ sessionId: 10, eventType: "started" });
    mocks.legacyControlOwnWorkShift.mockRejectedValue(new Error("controle legado não deve ser utilizado"));
  });

  it("consulta somente a jornada do usuário autenticado com work_shifts.view", async () => {
    const caller = appRouter.createCaller(context());

    await caller.workShifts.current();

    expect(mocks.assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, operationalRole: "agente" }),
      "work_shifts.view",
    );
    expect(mocks.getOwnCurrentWorkShift).toHaveBeenCalledWith(7);
  });

  it("pagina somente o histórico do usuário autenticado", async () => {
    const caller = appRouter.createCaller(context());

    await caller.workShifts.history({ page: 2, pageSize: 10 });

    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shifts.view");
    expect(mocks.listOwnWorkShiftHistory).toHaveBeenCalledWith({ userId: 7, page: 2, pageSize: 10 });
  });

  it("controla a própria jornada pelo wiring planejado e ignora identidade/equipe/timestamp enviados pelo cliente", async () => {
    const caller = appRouter.createCaller(context());

    await caller.workShifts.control({
      action: "start",
      userId: 999,
      teamId: 999,
      now: "2035-01-01T00:00:00.000Z",
    } as never);

    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shifts.control");
    expect(mocks.controlOwnWorkShift).toHaveBeenCalledWith({ userId: 7, teamId: 3, action: "start" });
    expect(mocks.legacyControlOwnWorkShift).not.toHaveBeenCalled();
  });
});
