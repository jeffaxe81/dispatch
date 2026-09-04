import { getDb } from "./db";
import { handleWorkShiftCommand } from "./workShiftApplicationService";
import type { WorkShiftCommand, WorkShiftSnapshot } from "./workShiftDomain";
import { selectActiveWorkShiftSession } from "./workShiftGateway";
import { createWorkShiftPersistenceAdapter } from "./workShiftPersistenceAdapter";
import { executeWorkShiftTransition } from "./workShiftService";

type ActiveSession = {
  id: number;
  state: WorkShiftSnapshot["state"];
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
};

type RuntimeInput = {
  userId: number;
  actorUserId: number;
  command: WorkShiftCommand;
};

export async function runWorkShiftCommand(
  input: RuntimeInput,
  dependencies: {
    findActiveSession: (userId: number) => Promise<ActiveSession | null>;
    executeTransition: (input: {
      sessionId: number | null;
      userId: number;
      actorUserId: number;
      current: WorkShiftSnapshot;
      command: WorkShiftCommand;
    }) => Promise<{ sessionId: number; snapshot: WorkShiftSnapshot }>;
  },
) {
  return handleWorkShiftCommand(input, dependencies);
}

export async function runDatabaseWorkShiftCommand(input: RuntimeInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return runWorkShiftCommand(input, {
    findActiveSession: userId => selectActiveWorkShiftSession(db as never, userId),
    executeTransition: transitionInput =>
      executeWorkShiftTransition(
        transitionInput,
        createWorkShiftPersistenceAdapter(db, transitionInput.sessionId),
      ),
  });
}
