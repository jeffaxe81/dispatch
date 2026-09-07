export type WorkSessionAction = "start" | "pause" | "resume" | "end";

export type WorkSessionShiftState = {
  startedAt: Date | null;
  pausedAt: Date | null;
  endedAt: Date | null;
  pausedTotalSeconds: number;
};

export type WorkSessionTeamPatch = {
  shiftStartedAt?: Date;
  shiftEndsAt?: Date | null;
  shiftPausedAt?: Date | null;
  shiftPausedTotalSeconds?: number;
};

export type WorkSessionTransition = {
  teamPatch: WorkSessionTeamPatch;
  eventType: WorkSessionAction;
  sessionStatus: "open" | "paused" | "closed";
};

export function resolveWorkSessionAction(
  input: WorkSessionShiftState,
  action: WorkSessionAction,
  now = new Date(),
): WorkSessionTransition {
  const active = Boolean(input.startedAt && !input.endedAt);
  const paused = Boolean(active && input.pausedAt);
  const additionalPausedSeconds =
    (action === "resume" || action === "end") && input.pausedAt
      ? Math.floor((now.getTime() - input.pausedAt.getTime()) / 1000)
      : 0;
  const pausedTotalSeconds = Math.max(0, input.pausedTotalSeconds + additionalPausedSeconds);

  if (action === "start") {
    if (active) throw new Error("A jornada já está em andamento.");
    return {
      teamPatch: {
        shiftStartedAt: now,
        shiftEndsAt: null,
        shiftPausedAt: null,
        shiftPausedTotalSeconds: 0,
      },
      eventType: "start",
      sessionStatus: "open",
    };
  }

  if (!active) throw new Error("Inicie a jornada antes desta ação.");

  if (action === "pause") {
    if (paused) throw new Error("A jornada já está em pausa.");
    return {
      teamPatch: { shiftPausedAt: now },
      eventType: "pause",
      sessionStatus: "paused",
    };
  }

  if (action === "resume") {
    if (!paused) throw new Error("A jornada não está em pausa.");
    return {
      teamPatch: {
        shiftPausedAt: null,
        shiftPausedTotalSeconds: pausedTotalSeconds,
      },
      eventType: "resume",
      sessionStatus: "open",
    };
  }

  return {
    teamPatch: {
      shiftEndsAt: now,
      shiftPausedAt: null,
      shiftPausedTotalSeconds: pausedTotalSeconds,
    },
    eventType: "end",
    sessionStatus: "closed",
  };
}

export function validateWorkSessionAdjustmentReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) throw new Error("A justificativa do ajuste administrativo é obrigatória.");
  return normalized;
}
