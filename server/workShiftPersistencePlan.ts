import type { WorkShiftCommand, WorkShiftSnapshot } from "./workShiftDomain";

function serializeSnapshot(snapshot: WorkShiftSnapshot) {
  return {
    state: snapshot.state,
    startedAt: snapshot.startedAt?.toISOString() ?? null,
    breakStartedAt: snapshot.breakStartedAt?.toISOString() ?? null,
    endedAt: snapshot.endedAt?.toISOString() ?? null,
  };
}

export function buildWorkShiftPersistencePlan(input: {
  sessionId: number;
  userId: number;
  actorUserId: number;
  previous: WorkShiftSnapshot;
  next: WorkShiftSnapshot;
  command: WorkShiftCommand;
}) {
  return {
    sessionPatch: {
      state: input.next.state,
      startedAt: input.next.startedAt,
      breakStartedAt: input.next.breakStartedAt,
      endedAt: input.next.endedAt,
    },
    event: {
      sessionId: input.sessionId,
      userId: input.userId,
      eventType: input.command.type,
      previousState: input.previous.state,
      nextState: input.next.state,
      occurredAt: input.command.at,
      actorUserId: input.actorUserId,
      metadata: null,
    },
    audit: {
      resourceType: "work_shift_session",
      resourceId: input.sessionId,
      action: input.command.type,
      actorUserId: input.actorUserId,
      beforeData: serializeSnapshot(input.previous),
      afterData: serializeSnapshot(input.next),
    },
  };
}
