export type WorkShiftReportStatus = "active" | "paused" | "ended" | "cancelled";

export type WorkShiftReportFilters = {
  from?: Date;
  to?: Date;
  userId?: number;
  teamId?: number;
  status?: WorkShiftReportStatus;
};

export type WorkShiftReportSession = {
  id: number;
  userId: number;
  teamId: number | null;
  scheduleAssignmentId: number | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  startedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  status: WorkShiftReportStatus;
  pausedSeconds: number;
  workedSeconds: number;
  overtimeSeconds: number;
  lateStartSeconds: number;
  earlyEndSeconds: number;
};

export type WorkShiftReportRow = {
  sessionId: number;
  userId: number;
  teamId: number | null;
  status: WorkShiftReportStatus;
  plannedSeconds: number;
  workedSeconds: number;
  pausedSeconds: number;
  overtimeSeconds: number;
  lateStartSeconds: number;
  earlyEndSeconds: number;
  missingEnd: boolean;
  hasApprovedAdjustment: boolean;
};

export type WorkShiftReportSummary = {
  sessionCount: number;
  plannedSeconds: number;
  workedSeconds: number;
  pausedSeconds: number;
  overtimeSeconds: number;
  lateStartSeconds: number;
  earlyEndSeconds: number;
  missingEndCount: number;
};
