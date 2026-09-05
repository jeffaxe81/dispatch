import type {
  WorkShiftAdjustmentRecord,
  WorkShiftAdjustmentRequestedChanges,
  WorkShiftAdjustmentSnapshot,
} from "../shared/workShiftAdjustments";

export type { WorkShiftAdjustmentSnapshot } from "../shared/workShiftAdjustments";

const ALLOWED_CHANGE_KEYS = new Set(["startedAt", "endedAt", "pausedSeconds", "teamId", "status"]);

function cloneSnapshot(snapshot: WorkShiftAdjustmentSnapshot): WorkShiftAdjustmentSnapshot {
  return {
    ...snapshot,
    scheduledStartAt: snapshot.scheduledStartAt ? new Date(snapshot.scheduledStartAt) : null,
    scheduledEndAt: snapshot.scheduledEndAt ? new Date(snapshot.scheduledEndAt) : null,
    startedAt: new Date(snapshot.startedAt),
    pausedAt: snapshot.pausedAt ? new Date(snapshot.pausedAt) : null,
    endedAt: snapshot.endedAt ? new Date(snapshot.endedAt) : null,
  };
}

function canonicalSnapshot(snapshot: WorkShiftAdjustmentSnapshot) {
  return JSON.stringify({
    ...snapshot,
    scheduledStartAt: snapshot.scheduledStartAt?.toISOString() ?? null,
    scheduledEndAt: snapshot.scheduledEndAt?.toISOString() ?? null,
    startedAt: snapshot.startedAt.toISOString(),
    pausedAt: snapshot.pausedAt?.toISOString() ?? null,
    endedAt: snapshot.endedAt?.toISOString() ?? null,
  });
}

function elapsedSeconds(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function validateRequestedChanges(changes: WorkShiftAdjustmentRequestedChanges) {
  for (const key of Object.keys(changes)) {
    if (!ALLOWED_CHANGE_KEYS.has(key)) {
      throw new Error(`Unsupported work shift adjustment field: ${key}`);
    }
  }
  if (changes.pausedSeconds !== undefined && changes.pausedSeconds < 0) {
    throw new Error("Invalid pausedSeconds adjustment.");
  }
}

function materializeAfterSnapshot(
  current: WorkShiftAdjustmentSnapshot,
  changes: WorkShiftAdjustmentRequestedChanges,
): WorkShiftAdjustmentSnapshot {
  const next: WorkShiftAdjustmentSnapshot = {
    ...cloneSnapshot(current),
    ...changes,
    startedAt: changes.startedAt ? new Date(changes.startedAt) : new Date(current.startedAt),
    endedAt:
      changes.endedAt === undefined
        ? current.endedAt ? new Date(current.endedAt) : null
        : changes.endedAt ? new Date(changes.endedAt) : null,
  };

  const effectiveEnd = next.endedAt;
  next.workedSeconds = effectiveEnd
    ? Math.max(0, elapsedSeconds(next.startedAt, effectiveEnd) - next.pausedSeconds)
    : current.workedSeconds;

  next.lateStartSeconds = next.scheduledStartAt
    ? elapsedSeconds(next.scheduledStartAt, next.startedAt)
    : 0;

  next.earlyEndSeconds = next.scheduledEndAt && effectiveEnd
    ? elapsedSeconds(effectiveEnd, next.scheduledEndAt)
    : 0;

  const plannedWorkSeconds = next.scheduledStartAt && next.scheduledEndAt
    ? elapsedSeconds(next.scheduledStartAt, next.scheduledEndAt)
    : 0;
  next.overtimeSeconds = plannedWorkSeconds > 0
    ? Math.max(0, next.workedSeconds - plannedWorkSeconds)
    : 0;

  return next;
}

export function requestWorkShiftAdjustment(input: {
  session: WorkShiftAdjustmentSnapshot;
  requestedByUserId: number;
  reason: string;
  changes: WorkShiftAdjustmentRequestedChanges;
  now?: Date;
}): WorkShiftAdjustmentRecord {
  validateRequestedChanges(input.changes);
  if (!input.reason.trim()) throw new Error("Adjustment reason is required.");

  return {
    sessionId: input.session.id,
    requestedByUserId: input.requestedByUserId,
    decidedByUserId: null,
    status: "pending",
    reason: input.reason.trim(),
    decisionReason: null,
    requestedChanges: { ...input.changes },
    beforeSnapshot: cloneSnapshot(input.session),
    afterSnapshot: null,
    requestedAt: input.now ?? new Date(),
    decidedAt: null,
    appliedAt: null,
  };
}

export function approveWorkShiftAdjustment(input: {
  adjustment: WorkShiftAdjustmentRecord;
  currentSession: WorkShiftAdjustmentSnapshot;
  decidedByUserId: number;
  now?: Date;
}): WorkShiftAdjustmentRecord {
  if (input.adjustment.status === "approved") return input.adjustment;
  if (input.adjustment.status !== "pending") {
    throw new Error("Work shift adjustment is no longer pending.");
  }
  if (canonicalSnapshot(input.adjustment.beforeSnapshot) !== canonicalSnapshot(input.currentSession)) {
    throw new Error("Work shift session changed after the adjustment request.");
  }

  const now = input.now ?? new Date();
  return {
    ...input.adjustment,
    decidedByUserId: input.decidedByUserId,
    status: "approved",
    afterSnapshot: materializeAfterSnapshot(input.currentSession, input.adjustment.requestedChanges),
    decidedAt: now,
    appliedAt: now,
  };
}

export function rejectWorkShiftAdjustment(input: {
  adjustment: WorkShiftAdjustmentRecord;
  decidedByUserId: number;
  reason: string;
  now?: Date;
}): WorkShiftAdjustmentRecord {
  if (input.adjustment.status === "rejected") return input.adjustment;
  if (input.adjustment.status !== "pending") {
    throw new Error("Work shift adjustment is no longer pending.");
  }
  if (!input.reason.trim()) throw new Error("Rejection reason is required.");

  return {
    ...input.adjustment,
    decidedByUserId: input.decidedByUserId,
    status: "rejected",
    decisionReason: input.reason.trim(),
    afterSnapshot: null,
    decidedAt: input.now ?? new Date(),
    appliedAt: null,
  };
}
