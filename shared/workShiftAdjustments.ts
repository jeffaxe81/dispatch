export type WorkShiftAdjustmentStatus = "pending" | "approved" | "rejected";

export type WorkShiftAdjustmentSessionStatus = "active" | "paused" | "ended" | "cancelled";

export type WorkShiftAdjustmentSnapshot = {
  id: number;
  userId: number;
  teamId: number | null;
  scheduleAssignmentId: number | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  startedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  status: WorkShiftAdjustmentSessionStatus;
  pausedSeconds: number;
  workedSeconds: number;
  overtimeSeconds: number;
  lateStartSeconds: number;
  earlyEndSeconds: number;
};

export type WorkShiftAdjustmentRequestedChanges = Partial<{
  startedAt: Date;
  endedAt: Date | null;
  pausedSeconds: number;
  teamId: number | null;
  status: WorkShiftAdjustmentSessionStatus;
}>;

export type WorkShiftAdjustmentRecord = {
  id?: number;
  sessionId: number;
  requestedByUserId: number;
  decidedByUserId: number | null;
  status: WorkShiftAdjustmentStatus;
  reason: string;
  decisionReason: string | null;
  requestedChanges: WorkShiftAdjustmentRequestedChanges;
  beforeSnapshot: WorkShiftAdjustmentSnapshot;
  afterSnapshot: WorkShiftAdjustmentSnapshot | null;
  requestedAt: Date;
  decidedAt: Date | null;
  appliedAt: Date | null;
};
