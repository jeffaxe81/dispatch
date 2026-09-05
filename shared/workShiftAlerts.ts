export type WorkShiftAlertType =
  | "SHIFT_NOT_STARTED_NEAR_PLANNED_TIME"
  | "LATE_START"
  | "PAUSE_EXCEEDED"
  | "SHIFT_OVERRUN"
  | "SHIFT_NOT_ENDED"
  | "COVERAGE_GAP"
  | "AVAILABLE_OUTSIDE_SHIFT"
  | "LEGACY_SHIFT_STATE_DIVERGENCE"
  | "DISPATCH_EXCLUDED_BY_SHIFT";

export type WorkShiftAlertSeverity = "info" | "warning" | "critical";
export type WorkShiftAlertStatus = "open" | "acknowledged" | "resolved";

export type WorkShiftAlertSnapshot = {
  type: WorkShiftAlertType;
  severity: WorkShiftAlertSeverity;
  status: WorkShiftAlertStatus;
  dedupeKey: string;
  userId: number | null;
  teamId: number | null;
  sessionId: number | null;
  detectedAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: number | null;
  resolvedAt: Date | null;
  resolvedByUserId: number | null;
  metadata: Record<string, unknown>;
};

export type WorkShiftAlertPolicy = {
  notStartedGraceSeconds: number;
  lateStartThresholdSeconds: number;
  pauseExceededSeconds: number;
  shiftOverrunSeconds: number;
  notEndedGraceSeconds: number;
};
