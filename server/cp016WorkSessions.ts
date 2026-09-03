import { deriveOperationalPresence, type TeamOperationalStatus } from "./operationalPresence";
import { resolveWorkSessionAction, type WorkSessionAction, type WorkSessionStatus } from "./workSessionState";

type TeamShiftSnapshot = {
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

type SessionOperation =
  | {
      type: "create";
      status: "open";
      startedAt: Date;
      pausedAt: null;
      endedAt: null;
      totalPauseSeconds: 0;
    }
  | ({ type: "update"; id: number } & Record<string, unknown>);

export function buildCp016ShiftPersistencePlan(input: {
  action: WorkSessionAction;
  now?: Date;
  teamSnapshot: TeamShiftSnapshot;
  activeSession: ActiveSession | null;
}) {
  const now = input.now ?? new Date();

  if (input.action === "start") {
    const resolved = resolveWorkSessionAction(
      {
        status: input.teamSnapshot.shiftStartedAt && !input.teamSnapshot.shiftEndsAt ? "open" : "closed",
        startedAt: input.teamSnapshot.shiftStartedAt,
        pausedAt: input.teamSnapshot.shiftPausedAt,
        endedAt: input.teamSnapshot.shiftEndsAt,
        totalPauseSeconds: input.teamSnapshot.shiftPausedTotalSeconds,
      },
      "start",
      now,
    );

    return {
      teamPatch: resolved.snapshotPatch,
      sessionOperation: {
        type: "create",
        status: "open",
        startedAt: now,
        pausedAt: null,
        endedAt: null,
        totalPauseSeconds: 0,
      } as SessionOperation,
      event: resolved.event,
      presence: deriveOperationalPresence({
        inShift: true,
        shiftPaused: false,
        teamStatus: input.teamSnapshot.status,
        hasActiveIncident: false,
        online: true,
      }),
    };
  }

  if (!input.activeSession) {
    throw new Error("Sessão de trabalho ativa não encontrada para a jornada atual.");
  }

  const resolved = resolveWorkSessionAction(
    {
      status: input.activeSession.status,
      startedAt: input.activeSession.startedAt,
      pausedAt: input.activeSession.pausedAt,
      endedAt: input.activeSession.endedAt,
      totalPauseSeconds: input.activeSession.totalPauseSeconds,
    },
    input.action,
    now,
  );

  const inShift = input.action !== "end";
  const shiftPaused = input.action === "pause";

  return {
    teamPatch: resolved.snapshotPatch,
    sessionOperation: {
      type: "update",
      id: input.activeSession.id,
      ...resolved.sessionPatch,
    } as SessionOperation,
    event: resolved.event,
    presence: deriveOperationalPresence({
      inShift,
      shiftPaused,
      teamStatus: input.teamSnapshot.status,
      hasActiveIncident: false,
      online: true,
    }),
  };
}
