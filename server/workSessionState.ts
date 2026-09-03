export type WorkSessionStatus = "open" | "paused" | "closed" | "adjusted";
export type WorkSessionAction = "start" | "pause" | "resume" | "end";
export type WorkSessionEventType = "start" | "pause" | "resume" | "end" | "adjustment";

type WorkSessionState = {
  status: WorkSessionStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  pausedAt: Date | null;
  totalPauseSeconds: number;
};

type SessionPatch = Partial<WorkSessionState>;

type TeamShiftSnapshotPatch = {
  shiftStartedAt?: Date | null;
  shiftEndsAt?: Date | null;
  shiftPausedAt?: Date | null;
  shiftPausedTotalSeconds?: number;
};

export function resolveWorkSessionAction(
  state: WorkSessionState,
  action: WorkSessionAction,
  occurredAt = new Date(),
): {
  sessionPatch: SessionPatch;
  snapshotPatch: TeamShiftSnapshotPatch;
  event: { eventType: Exclude<WorkSessionEventType, "adjustment">; occurredAt: Date };
} {
  if (action === "start") {
    if (state.status === "open" || state.status === "paused") {
      throw new Error("A jornada já está em andamento.");
    }
    return {
      sessionPatch: {
        status: "open",
        startedAt: occurredAt,
        endedAt: null,
        pausedAt: null,
        totalPauseSeconds: 0,
      },
      snapshotPatch: {
        shiftStartedAt: occurredAt,
        shiftEndsAt: null,
        shiftPausedAt: null,
        shiftPausedTotalSeconds: 0,
      },
      event: { eventType: "start", occurredAt },
    };
  }

  if (action === "pause") {
    if (state.status === "closed" || !state.startedAt) {
      throw new Error("Inicie a jornada antes de registrar uma pausa.");
    }
    if (state.status === "paused" || state.pausedAt) {
      throw new Error("A jornada já está em pausa.");
    }
    return {
      sessionPatch: { status: "paused", pausedAt: occurredAt },
      snapshotPatch: { shiftPausedAt: occurredAt },
      event: { eventType: "pause", occurredAt },
    };
  }

  if (action === "resume") {
    if (state.status !== "paused" || !state.pausedAt) {
      throw new Error("A jornada não está em pausa.");
    }
    const elapsedPauseSeconds = Math.max(
      0,
      Math.floor((occurredAt.getTime() - state.pausedAt.getTime()) / 1000),
    );
    const totalPauseSeconds = state.totalPauseSeconds + elapsedPauseSeconds;
    return {
      sessionPatch: { status: "open", pausedAt: null, totalPauseSeconds },
      snapshotPatch: {
        shiftPausedAt: null,
        shiftPausedTotalSeconds: totalPauseSeconds,
      },
      event: { eventType: "resume", occurredAt },
    };
  }

  if (state.status === "closed" || !state.startedAt) {
    throw new Error("Inicie a jornada antes de encerrá-la.");
  }
  const elapsedPauseSeconds = state.pausedAt
    ? Math.max(0, Math.floor((occurredAt.getTime() - state.pausedAt.getTime()) / 1000))
    : 0;
  const totalPauseSeconds = state.totalPauseSeconds + elapsedPauseSeconds;
  return {
    sessionPatch: {
      status: "closed",
      endedAt: occurredAt,
      pausedAt: null,
      ...(elapsedPauseSeconds > 0 ? { totalPauseSeconds } : {}),
    },
    snapshotPatch: {
      shiftEndsAt: occurredAt,
      shiftPausedAt: null,
      shiftPausedTotalSeconds: totalPauseSeconds,
    },
    event: { eventType: "end", occurredAt },
  };
}

export function buildAdministrativeAdjustment(input: {
  reason: string;
  actorUserId: number;
  occurredAt?: Date;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Uma justificativa é obrigatória para ajustes administrativos.");
  return {
    eventType: "adjustment" as const,
    actorUserId: input.actorUserId,
    occurredAt: input.occurredAt ?? new Date(),
    reason,
    requiresAuditLog: true as const,
  };
}
