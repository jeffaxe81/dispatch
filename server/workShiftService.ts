import { transitionWorkShift, type WorkShiftCommand, type WorkShiftSnapshot } from "./workShiftDomain";
import { buildWorkShiftPersistencePlan } from "./workShiftPersistencePlan";

type WorkShiftTransaction = {
  updateSession: (patch: ReturnType<typeof buildWorkShiftPersistencePlan>["sessionPatch"]) => Promise<unknown>;
  insertEvent: (event: ReturnType<typeof buildWorkShiftPersistencePlan>["event"]) => Promise<unknown>;
  insertAudit: (audit: ReturnType<typeof buildWorkShiftPersistencePlan>["audit"]) => Promise<unknown>;
};

type WorkShiftPersistence = {
  transaction: <T>(callback: (tx: WorkShiftTransaction) => Promise<T>) => Promise<T>;
};

export async function executeWorkShiftTransition(
  input: {
    sessionId: number;
    userId: number;
    actorUserId: number;
    current: WorkShiftSnapshot;
    command: WorkShiftCommand;
  },
  persistence: WorkShiftPersistence,
) {
  const next = transitionWorkShift(input.current, input.command);
  const plan = buildWorkShiftPersistencePlan({
    sessionId: input.sessionId,
    userId: input.userId,
    actorUserId: input.actorUserId,
    previous: input.current,
    next,
    command: input.command,
  });

  await persistence.transaction(async tx => {
    await tx.updateSession(plan.sessionPatch);
    await tx.insertEvent(plan.event);
    await tx.insertAudit(plan.audit);
  });

  return next;
}
