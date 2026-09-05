import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(async () => undefined),
  resolveActor: vi.fn(async () => ({
    userId: 7,
    organizationId: 10,
    organizationalUnitId: 20,
    permissions: ["work_shift_schedules.view", "work_shift_schedules.manage"],
  })),
  listSchedules: vi.fn(async () => [{ id: 100, code: "12X36-CENTRAL" }]),
  createSchedule: vi.fn(),
  assignSchedule: vi.fn(),
  addException: vi.fn(),
  resolveForUser: vi.fn(),
  coverage: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
}));

vi.mock("./workShiftSchedulesRuntime", () => ({
  workShiftSchedulesRouterDependencies: {
    resolveActor: mocks.resolveActor,
    listSchedules: mocks.listSchedules,
    createSchedule: mocks.createSchedule,
    assignSchedule: mocks.assignSchedule,
    addException: mocks.addException,
    resolveForUser: mocks.resolveForUser,
    coverage: mocks.coverage,
  },
}));

import { rootRouter } from "./rootRouter";

function context(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "schedule-admin",
      name: "Administrador Escalas",
      email: "schedule.admin@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "administrador",
      teamId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("application root router with D-007B", () => {
  it("expõe workShiftSchedules sem remover as rotas existentes", async () => {
    const caller = rootRouter.createCaller(context());

    const schedules = await caller.workShiftSchedules.list({ organizationId: 10, organizationalUnitId: 20 });

    expect(schedules).toEqual([{ id: 100, code: "12X36-CENTRAL" }]);
    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shift_schedules.view");
    expect(caller.workShifts).toBeDefined();
    expect(caller.dashboard).toBeDefined();
  });
});
