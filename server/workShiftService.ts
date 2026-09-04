import { transitionWorkShift, type WorkShiftCommand, type WorkShiftSnapshot } from "./workShiftDomain";
import { buildWorkShiftPersistencePlan } from "./workShiftPersistencePlan";

type PersistencePlan = ReturnType<typeof buildWorkShiftPersistencePlan>;

type WorkShiftTransaction = {
  createSession: (input: { userId: number }) => Promise<number>;
  updateSession: (patch: PersistencePlan["sessionPatch"]) => Promise<unknown>;
  insertEvent: (event: PersistencePlan["event"]) => Promise<unknown>;
  insertAudit: (audit: PersistencePlan["audit"]) => Promise<unknown>;
};

type WorkShiftPersistence = {
  transaction: <T>(callback: (tx: WorkShiftTransaction) => Promise<T>) => Promise<T>;
};

export async function executeWorkShiftTransition(
  input: {
    sessionId: number | null;
    userId: number;
    actorUserId: number;
    current: WorkShiftSnapshot;
    command: WorkShiftCommand;
  },
  persistence: WorkShiftPersistence,
) {
  const next = transitionWorkShift(input.current, input.command);

  return persistence.transaction(async tx => {
    const sessionId = input.sessionId ?? (await tx.createSession({ userId: input.userId }));
    const plan = buildWorkShiftPersistencePlan({
      sessionId,
      userId: input.userId,
      actorUserId: input.actorUserId,
      previous: input.current,
      next,
      command: input.command,
    });

    await tx.updateSession(plan.sessionPatch);
    await tx.insertEvent(plan.event);
    await tx.insertAudit(plan.audit);

    return { sessionId, snapshot: next };
  });
}
