import type { WorkShiftAction, WorkShiftEventType, WorkShiftSource } from "../shared/workShifts";
import {
  resolveWorkShiftTransition,
  type OpenWorkShiftSnapshot,
  type WorkShiftLegacyPatch,
  type WorkShiftSessionPatch,
} from "./workShiftDomain";

export type WorkShiftCreateSession = {
  userId: number;
  teamId: number | null;
  source: WorkShiftSource;
  startedAt: Date;
  pausedAt: null;
  endedAt: null;
  status: "active";
  pausedSeconds: number;
  workedSeconds: number;
};

export type WorkShiftEventSnapshot = Record<string, string | number | boolean | null>;

export type WorkShiftStore = {
  getOpenSession(userId: number): Promise<OpenWorkShiftSnapshot | null>;
  createSession(input: WorkShiftCreateSession): Promise<{ id: number }>;
  updateSession(sessionId: number, patch: WorkShiftSessionPatch): Promise<void>;
  appendEvent(input: {
    sessionId: number;
    eventType: WorkShiftEventType;
    actorUserId: number;
    occurredAt: Date;
    beforeData: WorkShiftEventSnapshot | null;
    afterData: WorkShiftEventSnapshot | null;
  }): Promise<void>;
  mirrorTeam(teamId: number, patch: WorkShiftLegacyPatch): Promise<void>;
};

export function snapshotOpenSession(value: OpenWorkShiftSnapshot | null): WorkShiftEventSnapshot | null {
  if (!value) return null;
  return {
    id: value.id,
    startedAt: value.startedAt.toISOString(),
    pausedAt: value.pausedAt?.toISOString() ?? null,
    endedAt: value.endedAt?.toISOString() ?? null,
    status: value.status,
    pausedSeconds: value.pausedSeconds,
  };
}

function snapshotCreatedSession(sessionId: number, input: WorkShiftCreateSession): WorkShiftEventSnapshot {
  return {
    id: sessionId,
    userId: input.userId,
    teamId: input.teamId,
    source: input.source,
    startedAt: input.startedAt.toISOString(),
    pausedAt: null,
    endedAt: null,
    status: input.status,
    pausedSeconds: input.pausedSeconds,
    workedSeconds: input.workedSeconds,
  };
}

function snapshotUpdatedSession(
  current: OpenWorkShiftSnapshot,
  patch: WorkShiftSessionPatch,
): WorkShiftEventSnapshot {
  return {
    id: current.id,
    startedAt: current.startedAt.toISOString(),
    pausedAt:
      patch.pausedAt === undefined
        ? current.pausedAt?.toISOString() ?? null
        : patch.pausedAt?.toISOString() ?? null,
    endedAt: patch.endedAt?.toISOString() ?? current.endedAt?.toISOString() ?? null,
    status: patch.status,
    pausedSeconds: patch.pausedSeconds ?? current.pausedSeconds,
    ...(patch.workedSeconds === undefined ? {} : { workedSeconds: patch.workedSeconds }),
  };
}

export async function executeOwnWorkShiftAction(
  store: WorkShiftStore,
  input: {
    userId: number;
    teamId: number | null;
    action: WorkShiftAction;
    source?: WorkShiftSource;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const source = input.source ?? "self";
  const current = await store.getOpenSession(input.userId);
  const transition = resolveWorkShiftTransition(current, input.action, now);

  if (transition.mode === "create") {
    const createInput: WorkShiftCreateSession = {
      userId: input.userId,
      teamId: input.teamId,
      source,
      ...transition.session,
    };
    const created = await store.createSession(createInput);

    await store.appendEvent({
      sessionId: created.id,
      eventType: transition.eventType,
      actorUserId: input.userId,
      occurredAt: now,
      beforeData: null,
      afterData: snapshotCreatedSession(created.id, createInput),
    });

    if (input.teamId !== null) {
      await store.mirrorTeam(input.teamId, transition.legacyPatch);
    }

    return { sessionId: created.id, eventType: transition.eventType };
  }

  if (!current) throw new Error("Sessão de jornada ausente durante atualização.");

  await store.updateSession(current.id, transition.sessionPatch);
  await store.appendEvent({
    sessionId: current.id,
    eventType: transition.eventType,
    actorUserId: input.userId,
    occurredAt: now,
    beforeData: snapshotOpenSession(current),
    afterData: snapshotUpdatedSession(current, transition.sessionPatch),
  });

  if (input.teamId !== null) {
    await store.mirrorTeam(input.teamId, transition.legacyPatch);
  }

  return { sessionId: current.id, eventType: transition.eventType };
}
