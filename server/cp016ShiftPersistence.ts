import type { TeamOperationalStatus } from "./operationalPresence";
import { buildCp016ShiftPersistencePlan } from "./cp016WorkSessions";
import type { WorkSessionAction, WorkSessionStatus } from "./workSessionState";

type TeamSnapshot = {
  id: number;
  shiftStartedAt: Date | null;
  shiftPausedAt: Date | null;
  shiftEndsAt: Date | null;
  shiftPausedTotalSeconds: number;
  status: TeamOperationalStatus;
};

type ActiveSession = {
  id: number;
  startedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  totalPauseSeconds: number;
  status: WorkSessionStatus;
};

export type Cp016ShiftPersistenceAdapter = {
  getTeamSnapshot(teamId: number): Promise<TeamSnapshot | null>;
  getActiveSession(teamId: number): Promise<ActiveSession | null>;
  updateTeamSnapshot(teamId: number, patch: Record<string, unknown>): Promise<void>;
  createSession(values: {
    teamId: number;
    userId: null;
    startedAt: Date;
    pausedAt: Date | null;
    endedAt: Date | null;
    totalPauseSeconds: number;
    status: WorkSessionStatus;
    source: "manual";
  }): Promise<number>;
  updateSession(sessionId: number, patch: Record<string, unknown>): Promise<void>;
  appendSessionEvent(values: {
    workSessionId: number;
    eventType: "start" | "pause" | "resume" | "end";
    occurredAt: Date;
    actorUserId: number;
  }): Promise<void>;
  upsertPresence(values: {
    teamId: number;
    userId: null;
    workSessionId: number | null;
    status: "available" | "busy" | "paused" | "offline" | "out_of_shift";
    availableForDispatch: boolean;
    lastStatusAt: Date;
  }): Promise<void>;
  appendAuditLog(values: {
    resourceType: "team";
    resourceId: number;
    action: "shift_started" | "shift_paused" | "shift_resumed" | "shift_ended";
    actorUserId: number;
    beforeData: Record<string, unknown>;
    afterData: Record<string, unknown>;
  }): Promise<void>;
};

const auditActionByShiftAction = {
  start: "shift_started",
  pause: "shift_paused",
  resume: "shift_resumed",
  end: "shift_ended",
} as const;

export async function executeCp016ShiftPersistence(
  input: {
    teamId: number;
    actorUserId: number;
    action: WorkSessionAction;
    now?: Date;
  },
  adapter: Cp016ShiftPersistenceAdapter,
) {
  const now = input.now ?? new Date();
  const team = await adapter.getTeamSnapshot(input.teamId);
  if (!team) throw new Error("Equipe não encontrada.");

  const activeSession = await adapter.getActiveSession(input.teamId);
  const plan = buildCp016ShiftPersistencePlan({
    action: input.action,
    now,
    teamSnapshot: team,
    activeSession,
  });

  await adapter.updateTeamSnapshot(input.teamId, plan.teamPatch);

  let workSessionId: number;
  if (plan.sessionOperation.type === "create") {
    workSessionId = await adapter.createSession({
      teamId: input.teamId,
      userId: null,
      startedAt: plan.sessionOperation.startedAt,
      pausedAt: plan.sessionOperation.pausedAt,
      endedAt: plan.sessionOperation.endedAt,
      totalPauseSeconds: plan.sessionOperation.totalPauseSeconds,
      status: plan.sessionOperation.status,
      source: "manual",
    });
  } else {
    workSessionId = plan.sessionOperation.id;
    const { type: _type, id: _id, ...sessionPatch } = plan.sessionOperation;
    await adapter.updateSession(workSessionId, sessionPatch);
  }

  await adapter.appendSessionEvent({
    workSessionId,
    eventType: plan.event.eventType,
    occurredAt: plan.event.occurredAt,
    actorUserId: input.actorUserId,
  });

  await adapter.upsertPresence({
    teamId: input.teamId,
    userId: null,
    workSessionId: input.action === "end" ? null : workSessionId,
    status: plan.presence.status,
    availableForDispatch: plan.presence.availableForDispatch,
    lastStatusAt: now,
  });

  await adapter.appendAuditLog({
    resourceType: "team",
    resourceId: input.teamId,
    action: auditActionByShiftAction[input.action],
    actorUserId: input.actorUserId,
    beforeData: {
      shiftStartedAt: team.shiftStartedAt?.toISOString() ?? null,
      shiftPausedAt: team.shiftPausedAt?.toISOString() ?? null,
      shiftEndsAt: team.shiftEndsAt?.toISOString() ?? null,
      shiftPausedTotalSeconds: team.shiftPausedTotalSeconds,
    },
    afterData: {
      ...plan.teamPatch,
      workSessionId,
      presenceStatus: plan.presence.status,
      availableForDispatch: plan.presence.availableForDispatch,
    },
  });

  return { success: true as const, workSessionId, eventType: plan.event.eventType };
}
