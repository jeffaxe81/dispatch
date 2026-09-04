import type { WorkShiftCommand, WorkShiftSnapshot } from "./workShiftDomain";

type ActiveSession = {
  id: number;
  state: WorkShiftSnapshot["state"];
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
};

type TransitionInput = {
  sessionId: number | null;
  userId: number;
  actorUserId: number;
  current: WorkShiftSnapshot;
  command: WorkShiftCommand;
};

type TransitionResult = {
  sessionId: number;
  snapshot: WorkShiftSnapshot;
};

export async function handleWorkShiftCommand(
  input: {
    userId: number;
    actorUserId: number;
    command: WorkShiftCommand;
  },
  dependencies: {
    findActiveSession: (userId: number) => Promise<ActiveSession | null>;
    executeTransition: (input: TransitionInput) => Promise<TransitionResult>;
  },
) {
  const activeSession = await dependencies.findActiveSession(input.userId);

  if (!activeSession && input.command.type !== "iniciar") {
    throw new Error("jornada_ativa_nao_encontrada");
  }

  const current: WorkShiftSnapshot = activeSession
    ? {
        state: activeSession.state,
        startedAt: activeSession.startedAt,
        breakStartedAt: activeSession.breakStartedAt,
        endedAt: activeSession.endedAt,
      }
    : {
        state: "fora_jornada",
        startedAt: null,
        breakStartedAt: null,
        endedAt: null,
      };

  return dependencies.executeTransition({
    sessionId: activeSession?.id ?? null,
    userId: input.userId,
    actorUserId: input.actorUserId,
    current,
    command: input.command,
  });
}
