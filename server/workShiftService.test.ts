import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenWorkShiftSnapshot, WorkShiftLegacyPatch } from "./workShiftDomain";

const runtimeMocks = vi.hoisted(() => ({
  resolveRuntimeWorkShiftPlan: vi.fn(),
  loadRuntimeWorkShiftPlanningSnapshot: vi.fn(),
}));

vi.mock("./workShiftPlanningRuntime", () => ({
  resolveRuntimeWorkShiftPlan: runtimeMocks.resolveRuntimeWorkShiftPlan,
  loadRuntimeWorkShiftPlanningSnapshot: runtimeMocks.loadRuntimeWorkShiftPlanningSnapshot,
}));

import {
  executeOwnWorkShiftAction,
  type WorkShiftCreateSession,
  type WorkShiftEventSnapshot,
  type WorkShiftPlanningResolver,
  type WorkShiftStore,
} from "./workShiftService";

function makeStore(current: OpenWorkShiftSnapshot | null) {
  const createSession = vi.fn(async (_input: WorkShiftCreateSession) => ({ id: 101 }));
  const updateSession = vi.fn(async () => undefined);
  const appendEvent = vi.fn(async () => undefined);
  const mirrorTeam = vi.fn(async (_teamId: number, _patch: WorkShiftLegacyPatch) => undefined);

  const store: WorkShiftStore = {
    getOpenSession: vi.fn(async () => current),
    createSession,
    updateSession,
    appendEvent,
    mirrorTeam,
  };

  return { store, createSession, updateSession, appendEvent, mirrorTeam };
}

function expectSerializableSnapshot(snapshot: WorkShiftEventSnapshot | null) {
  if (!snapshot) return;
  for (const value of Object.values(snapshot)) {
    expect(value instanceof Date).toBe(false);
  }
}

describe("executeOwnWorkShiftAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.resolveRuntimeWorkShiftPlan.mockResolvedValue(null);
    runtimeMocks.loadRuntimeWorkShiftPlanningSnapshot.mockResolvedValue(null);
  });

  it("cria sessão, um evento started e espelha a equipe no start", async () => {
    const now = new Date("2026-09-04T08:00:00.000Z");
    const { store, createSession, appendEvent, mirrorTeam } = makeStore(null);

    const result = await executeOwnWorkShiftAction(store, {
      userId: 7,
      teamId: 3,
      action: "start",
      now,
    });

    expect(result).toEqual({ sessionId: 101, eventType: "started" });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith({
      userId: 7,
      teamId: 3,
      source: "self",
      startedAt: now,
      pausedAt: null,
      endedAt: null,
      status: "active",
      pausedSeconds: 0,
      workedSeconds: 0,
      scheduleAssignmentId: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
      lateStartSeconds: 0,
      earlyEndSeconds: 0,
      overtimeSeconds: 0,
    });
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(appendEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 101,
      eventType: "started",
      actorUserId: 7,
      occurredAt: now,
      beforeData: null,
    });
    expectSerializableSnapshot(appendEvent.mock.calls[0]?.[0].afterData ?? null);
    expect(mirrorTeam).toHaveBeenCalledTimes(1);
    expect(mirrorTeam).toHaveBeenCalledWith(3, {
      shiftStartedAt: now,
      shiftEndsAt: null,
      shiftPausedAt: null,
      shiftPausedTotalSeconds: 0,
    });
  });

  it("materializa o planejamento resolvido no start e calcula atraso", async () => {
    const scheduledStartAt = new Date("2026-09-04T08:00:00.000Z");
    const scheduledEndAt = new Date("2026-09-04T20:00:00.000Z");
    const now = new Date("2026-09-04T08:10:00.000Z");
    const { store, createSession } = makeStore(null);
    const planningResolver: WorkShiftPlanningResolver = {
      resolveForUser: vi.fn(async () => ({
        assignmentId: 55,
        scheduleId: 10,
        plannedStartAt: scheduledStartAt,
        plannedEndAt: scheduledEndAt,
        inPlannedWindow: true,
        source: "schedule" as const,
      })),
    };

    await executeOwnWorkShiftAction(store, {
      userId: 7,
      teamId: 3,
      action: "start",
      now,
    }, planningResolver);

    expect(planningResolver.resolveForUser).toHaveBeenCalledWith(7, now);
    expect(runtimeMocks.resolveRuntimeWorkShiftPlan).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      scheduleAssignmentId: 55,
      scheduledStartAt,
      scheduledEndAt,
      lateStartSeconds: 600,
      earlyEndSeconds: 0,
      overtimeSeconds: 0,
    }));
  });

  it("usa o resolver runtime quando o adapter transacional não injeta resolver explícito", async () => {
    const scheduledStartAt = new Date("2026-09-04T08:00:00.000Z");
    const scheduledEndAt = new Date("2026-09-04T20:00:00.000Z");
    const now = new Date("2026-09-04T08:10:00.000Z");
    const { store, createSession } = makeStore(null);
    runtimeMocks.resolveRuntimeWorkShiftPlan.mockResolvedValueOnce({
      assignmentId: 55,
      scheduleId: 10,
      plannedStartAt: scheduledStartAt,
      plannedEndAt: scheduledEndAt,
      inPlannedWindow: true,
      source: "schedule",
    });

    await executeOwnWorkShiftAction(store, {
      userId: 7,
      teamId: 3,
      action: "start",
      now,
    });

    expect(runtimeMocks.resolveRuntimeWorkShiftPlan).toHaveBeenCalledWith(7, now);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      scheduleAssignmentId: 55,
      scheduledStartAt,
      scheduledEndAt,
      lateStartSeconds: 600,
    }));
  });

  it("não espelha equipe quando o usuário não possui teamId", async () => {
    const { store, mirrorTeam } = makeStore(null);

    await executeOwnWorkShiftAction(store, {
      userId: 7,
      teamId: null,
      action: "start",
      now: new Date("2026-09-04T08:00:00.000Z"),
    });

    expect(mirrorTeam).not.toHaveBeenCalled();
  });

  it("atualiza pause e resume na sessão existente com exatamente um evento por ação", async () => {
    const startedAt = new Date("2026-09-04T08:00:00.000Z");
    const pauseAt = new Date("2026-09-04T10:00:00.000Z");
    const active: OpenWorkShiftSnapshot = {
      id: 10,
      startedAt,
      pausedAt: null,
      endedAt: null,
      status: "active",
      pausedSeconds: 0,
    };
    const paused: OpenWorkShiftSnapshot = {
      ...active,
      status: "paused",
      pausedAt: pauseAt,
    };

    const pauseStore = makeStore(active);
    await executeOwnWorkShiftAction(pauseStore.store, {
      userId: 7,
      teamId: 3,
      action: "pause",
      now: pauseAt,
    });
    expect(pauseStore.updateSession).toHaveBeenCalledOnce();
    expect(pauseStore.updateSession).toHaveBeenCalledWith(10, { status: "paused", pausedAt: pauseAt });
    expect(pauseStore.appendEvent).toHaveBeenCalledOnce();
    expect(pauseStore.appendEvent.mock.calls[0]?.[0].eventType).toBe("paused");

    const resumeAt = new Date("2026-09-04T10:15:30.000Z");
    const resumeStore = makeStore(paused);
    await executeOwnWorkShiftAction(resumeStore.store, {
      userId: 7,
      teamId: 3,
      action: "resume",
      now: resumeAt,
    });
    expect(resumeStore.updateSession).toHaveBeenCalledOnce();
    expect(resumeStore.updateSession).toHaveBeenCalledWith(10, {
      status: "active",
      pausedAt: null,
      pausedSeconds: 930,
    });
    expect(resumeStore.appendEvent).toHaveBeenCalledOnce();
    expect(resumeStore.appendEvent.mock.calls[0]?.[0].eventType).toBe("resumed");
    expectSerializableSnapshot(resumeStore.appendEvent.mock.calls[0]?.[0].beforeData ?? null);
    expectSerializableSnapshot(resumeStore.appendEvent.mock.calls[0]?.[0].afterData ?? null);
  });

  it("encerra preservando workedSeconds calculado pelo domínio", async () => {
    const active: OpenWorkShiftSnapshot = {
      id: 10,
      startedAt: new Date("2026-09-04T08:00:00.000Z"),
      pausedAt: null,
      endedAt: null,
      status: "active",
      pausedSeconds: 930,
    };
    const { store, updateSession, appendEvent, mirrorTeam } = makeStore(active);
    const endAt = new Date("2026-09-04T12:00:00.000Z");

    const result = await executeOwnWorkShiftAction(store, {
      userId: 7,
      teamId: 3,
      action: "end",
      now: endAt,
    });

    expect(result).toEqual({ sessionId: 10, eventType: "ended" });
    expect(updateSession).toHaveBeenCalledWith(10, {
      status: "ended",
      pausedAt: null,
      endedAt: endAt,
      pausedSeconds: 930,
      workedSeconds: 13470,
      earlyEndSeconds: 0,
      overtimeSeconds: 0,
    });
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(appendEvent.mock.calls[0]?.[0].eventType).toBe("ended");
    expect(mirrorTeam).toHaveBeenCalledWith(3, {
      shiftEndsAt: endAt,
      shiftPausedAt: null,
      shiftPausedTotalSeconds: 930,
    });
  });

  it("hidrata o snapshot planejado no end quando o adapter legado não o seleciona", async () => {
    const active: OpenWorkShiftSnapshot = {
      id: 10,
      startedAt: new Date("2026-09-04T08:00:00.000Z"),
      pausedAt: null,
      endedAt: null,
      status: "active",
      pausedSeconds: 0,
    };
    runtimeMocks.loadRuntimeWorkShiftPlanningSnapshot.mockResolvedValueOnce({
      scheduleAssignmentId: 55,
      scheduledStartAt: new Date("2026-09-04T08:00:00.000Z"),
      scheduledEndAt: new Date("2026-09-04T20:00:00.000Z"),
      lateStartSeconds: 0,
      earlyEndSeconds: 0,
      overtimeSeconds: 0,
    });
    const { store, updateSession } = makeStore(active);
    const endAt = new Date("2026-09-04T19:45:00.000Z");

    await executeOwnWorkShiftAction(store, {
      userId: 7,
      teamId: 3,
      action: "end",
      now: endAt,
    });

    expect(runtimeMocks.loadRuntimeWorkShiftPlanningSnapshot).toHaveBeenCalledWith(10);
    expect(updateSession).toHaveBeenCalledWith(10, expect.objectContaining({
      earlyEndSeconds: 900,
      overtimeSeconds: 0,
    }));
  });

  it("calcula saída antecipada a partir do snapshot planejado salvo", async () => {
    const active = {
      id: 10,
      startedAt: new Date("2026-09-04T08:00:00.000Z"),
      pausedAt: null,
      endedAt: null,
      status: "active" as const,
      pausedSeconds: 0,
      scheduleAssignmentId: 55,
      scheduledStartAt: new Date("2026-09-04T08:00:00.000Z"),
      scheduledEndAt: new Date("2026-09-04T20:00:00.000Z"),
    } as OpenWorkShiftSnapshot;
    const { store, updateSession } = makeStore(active);
    const endAt = new Date("2026-09-04T19:45:00.000Z");

    await executeOwnWorkShiftAction(store, {
      userId: 7,
      teamId: 3,
      action: "end",
      now: endAt,
    });

    expect(runtimeMocks.loadRuntimeWorkShiftPlanningSnapshot).not.toHaveBeenCalled();
    expect(updateSession).toHaveBeenCalledWith(10, expect.objectContaining({
      earlyEndSeconds: 900,
      overtimeSeconds: 0,
    }));
  });

  it("calcula hora extra pelo trabalho realizado além da duração planejada", async () => {
    const active = {
      id: 10,
      startedAt: new Date("2026-09-04T08:00:00.000Z"),
      pausedAt: null,
      endedAt: null,
      status: "active" as const,
      pausedSeconds: 0,
      scheduleAssignmentId: 55,
      scheduledStartAt: new Date("2026-09-04T08:00:00.000Z"),
      scheduledEndAt: new Date("2026-09-04T20:00:00.000Z"),
    } as OpenWorkShiftSnapshot;
    const { store, updateSession } = makeStore(active);
    const endAt = new Date("2026-09-04T20:30:00.000Z");

    await executeOwnWorkShiftAction(store, {
      userId: 7,
      teamId: 3,
      action: "end",
      now: endAt,
    });

    expect(updateSession).toHaveBeenCalledWith(10, expect.objectContaining({
      earlyEndSeconds: 0,
      overtimeSeconds: 1800,
    }));
  });
});
