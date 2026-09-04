import type { WorkShiftAction, WorkShiftEventType, WorkShiftStatus } from "../shared/workShifts";

export type OpenWorkShiftSnapshot = {
  id: number;
  startedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  status: Extract<WorkShiftStatus, "active" | "paused">;
  pausedSeconds: number;
};

export type WorkShiftSessionPatch = {
  status: WorkShiftStatus;
  pausedAt?: Date | null;
  endedAt?: Date;
  pausedSeconds?: number;
  workedSeconds?: number;
};

export type WorkShiftLegacyPatch = {
  shiftStartedAt?: Date;
  shiftEndsAt?: Date | null;
  shiftPausedAt?: Date | null;
  shiftPausedTotalSeconds?: number;
};

export type WorkShiftTransitionPlan =
  | {
      mode: "create";
      eventType: WorkShiftEventType;
      session: {
        startedAt: Date;
        pausedAt: null;
        endedAt: null;
        status: "active";
        pausedSeconds: 0;
        workedSeconds: 0;
      };
      legacyPatch: WorkShiftLegacyPatch;
    }
  | {
      mode: "update";
      eventType: WorkShiftEventType;
      sessionPatch: WorkShiftSessionPatch;
      legacyPatch: WorkShiftLegacyPatch;
    };

function elapsedSeconds(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

export function resolveWorkShiftTransition(
  current: OpenWorkShiftSnapshot | null,
  action: WorkShiftAction,
  now = new Date(),
): WorkShiftTransitionPlan {
  if (action === "start") {
    if (current) throw new Error("A jornada já está em andamento.");
    return {
      mode: "create",
      eventType: "started",
      session: {
        startedAt: now,
        pausedAt: null,
        endedAt: null,
        status: "active",
        pausedSeconds: 0,
        workedSeconds: 0,
      },
      legacyPatch: {
        shiftStartedAt: now,
        shiftEndsAt: null,
        shiftPausedAt: null,
        shiftPausedTotalSeconds: 0,
      },
    };
  }

  if (!current) throw new Error("Inicie a jornada antes desta operação.");

  if (action === "pause") {
    if (current.status !== "active") throw new Error("A jornada já está em pausa.");
    return {
      mode: "update",
      eventType: "paused",
      sessionPatch: { status: "paused", pausedAt: now },
      legacyPatch: { shiftPausedAt: now },
    };
  }

  if (action === "resume") {
    if (current.status !== "paused" || !current.pausedAt) throw new Error("A jornada não está em pausa.");
    const pausedSeconds = current.pausedSeconds + elapsedSeconds(current.pausedAt, now);
    return {
      mode: "update",
      eventType: "resumed",
      sessionPatch: { status: "active", pausedAt: null, pausedSeconds },
      legacyPatch: { shiftPausedAt: null, shiftPausedTotalSeconds: pausedSeconds },
    };
  }

  const pausedSeconds = current.pausedSeconds + (current.pausedAt ? elapsedSeconds(current.pausedAt, now) : 0);
  const workedSeconds = Math.max(0, elapsedSeconds(current.startedAt, now) - pausedSeconds);
  return {
    mode: "update",
    eventType: "ended",
    sessionPatch: {
      status: "ended",
      pausedAt: null,
      endedAt: now,
      pausedSeconds,
      workedSeconds,
    },
    legacyPatch: {
      shiftEndsAt: now,
      shiftPausedAt: null,
      shiftPausedTotalSeconds: pausedSeconds,
    },
  };
}
