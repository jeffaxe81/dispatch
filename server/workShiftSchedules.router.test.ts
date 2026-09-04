import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const accessMocks = vi.hoisted(() => ({
  assertPermission: vi.fn(async () => undefined),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: accessMocks.assertPermission,
}));

import { createWorkShiftSchedulesRouter } from "./workShiftSchedulesRouter";

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

const actor = {
  userId: 7,
  organizationId: 10,
  organizationalUnitId: 20,
  permissions: ["work_shift_schedules.view", "work_shift_schedules.manage"],
};

function makeDeps() {
  return {
    resolveActor: vi.fn(async () => actor),
    listSchedules: vi.fn(async () => []),
    createSchedule: vi.fn(async (input: unknown) => ({ id: 100, ...(input as object) })),
    assignSchedule: vi.fn(async (input: unknown) => ({ id: 200, ...(input as object) })),
    addException: vi.fn(async (input: unknown) => ({ id: 300, ...(input as object) })),
    resolveForUser: vi.fn(async () => null),
    coverage: vi.fn(async () => []),
  };
}

describe("workShiftSchedules router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("protege list com work_shift_schedules.view e encaminha o escopo do ator", async () => {
    const deps = makeDeps();
    const caller = createWorkShiftSchedulesRouter(deps).createCaller(context());

    await caller.list({ organizationId: 10, organizationalUnitId: 20 });

    expect(accessMocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shift_schedules.view");
    expect(deps.resolveActor).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(deps.listSchedules).toHaveBeenCalledWith({ organizationId: 10, organizationalUnitId: 20 }, actor);
  });

  it("protege create com work_shift_schedules.manage", async () => {
    const deps = makeDeps();
    const caller = createWorkShiftSchedulesRouter(deps).createCaller(context());
    const input = {
      code: "12X36-CENTRAL",
      name: "12x36 Central",
      organizationId: 10,
      organizationalUnitId: 20,
      scheduleType: "cyclic_12x36" as const,
      timezone: "America/Sao_Paulo",
      startTimeLocal: "08:00",
      weekdays: null,
      plannedDurationMinutes: 720,
      breakPolicyMinutes: 60,
      cycleAnchorAt: new Date("2026-09-04T11:00:00.000Z"),
      cycleWorkMinutes: 720,
      cycleRestMinutes: 2160,
      effectiveFrom: new Date("2026-09-04T00:00:00.000Z"),
      effectiveUntil: null,
    };

    await caller.create(input);

    expect(accessMocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shift_schedules.manage");
    expect(deps.createSchedule).toHaveBeenCalledWith(input, actor);
  });

  it("protege assign com manage e não aceita identidade do ator pelo payload", async () => {
    const deps = makeDeps();
    const caller = createWorkShiftSchedulesRouter(deps).createCaller(context());
    const input = {
      scheduleId: 100,
      userId: 33,
      teamId: 3,
      effectiveFrom: new Date("2026-09-05T00:00:00.000Z"),
      effectiveUntil: null,
    };

    await caller.assign(input);

    expect(accessMocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shift_schedules.manage");
    expect(deps.assignSchedule).toHaveBeenCalledWith(input, actor);
  });

  it("protege addException com manage e usa o usuário autenticado como ator", async () => {
    const deps = makeDeps();
    const caller = createWorkShiftSchedulesRouter(deps).createCaller(context());
    const input = {
      assignmentId: 200,
      exceptionType: "day_off" as const,
      startsAt: new Date("2026-09-06T00:00:00.000Z"),
      endsAt: new Date("2026-09-07T00:00:00.000Z"),
      reason: "Folga excepcional",
    };

    await caller.addException(input);

    expect(accessMocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shift_schedules.manage");
    expect(deps.addException).toHaveBeenCalledWith(input, actor);
  });

  it("protege resolveForUser com view", async () => {
    const deps = makeDeps();
    const caller = createWorkShiftSchedulesRouter(deps).createCaller(context());
    const instant = new Date("2026-09-04T14:00:00.000Z");

    await caller.resolveForUser({ userId: 33, instant });

    expect(accessMocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shift_schedules.view");
    expect(deps.resolveForUser).toHaveBeenCalledWith({ userId: 33, instant }, actor);
  });

  it("protege coverage com view e mantém filtros explícitos de escopo", async () => {
    const deps = makeDeps();
    const caller = createWorkShiftSchedulesRouter(deps).createCaller(context());
    const input = {
      from: new Date("2026-09-04T00:00:00.000Z"),
      until: new Date("2026-09-05T00:00:00.000Z"),
      organizationId: 10,
      organizationalUnitId: 20,
      teamId: 3,
    };

    await caller.coverage(input);

    expect(accessMocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "work_shift_schedules.view");
    expect(deps.coverage).toHaveBeenCalledWith(input, actor);
  });
});
