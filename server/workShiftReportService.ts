import type {
  WorkShiftReportFilters,
  WorkShiftReportRow,
  WorkShiftReportSession,
  WorkShiftReportSummary,
} from "../shared/workShiftReports";

function elapsedSeconds(from: Date | null, to: Date | null) {
  if (!from || !to) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function overlapsPeriod(
  session: WorkShiftReportSession,
  evaluatedAt: Date,
  filters: WorkShiftReportFilters,
) {
  const effectiveEnd = session.endedAt ?? evaluatedAt;
  if (filters.from && effectiveEnd < filters.from) return false;
  if (filters.to && session.startedAt > filters.to) return false;
  return true;
}

function matchesFilters(
  session: WorkShiftReportSession,
  evaluatedAt: Date,
  filters: WorkShiftReportFilters,
) {
  if (filters.userId !== undefined && session.userId !== filters.userId) return false;
  if (filters.teamId !== undefined && session.teamId !== filters.teamId) return false;
  if (filters.status !== undefined && session.status !== filters.status) return false;
  return overlapsPeriod(session, evaluatedAt, filters);
}

function rowForSession(
  session: WorkShiftReportSession,
  evaluatedAt: Date,
  approvedAdjustmentSessionIds: ReadonlySet<number>,
): WorkShiftReportRow {
  const plannedSeconds = elapsedSeconds(session.scheduledStartAt, session.scheduledEndAt);
  const liveWorkedSeconds = session.endedAt
    ? session.workedSeconds
    : Math.max(0, elapsedSeconds(session.startedAt, evaluatedAt) - session.pausedSeconds);

  return {
    sessionId: session.id,
    userId: session.userId,
    teamId: session.teamId,
    status: session.status,
    plannedSeconds,
    workedSeconds: liveWorkedSeconds,
    pausedSeconds: session.pausedSeconds,
    overtimeSeconds: session.overtimeSeconds,
    lateStartSeconds: session.lateStartSeconds,
    earlyEndSeconds: session.earlyEndSeconds,
    missingEnd: session.endedAt === null,
    hasApprovedAdjustment: approvedAdjustmentSessionIds.has(session.id),
  };
}

function summarize(rows: WorkShiftReportRow[]): WorkShiftReportSummary {
  return rows.reduce<WorkShiftReportSummary>(
    (summary, row) => ({
      sessionCount: summary.sessionCount + 1,
      plannedSeconds: summary.plannedSeconds + row.plannedSeconds,
      workedSeconds: summary.workedSeconds + row.workedSeconds,
      pausedSeconds: summary.pausedSeconds + row.pausedSeconds,
      overtimeSeconds: summary.overtimeSeconds + row.overtimeSeconds,
      lateStartSeconds: summary.lateStartSeconds + row.lateStartSeconds,
      earlyEndSeconds: summary.earlyEndSeconds + row.earlyEndSeconds,
      missingEndCount: summary.missingEndCount + (row.missingEnd ? 1 : 0),
    }),
    {
      sessionCount: 0,
      plannedSeconds: 0,
      workedSeconds: 0,
      pausedSeconds: 0,
      overtimeSeconds: 0,
      lateStartSeconds: 0,
      earlyEndSeconds: 0,
      missingEndCount: 0,
    },
  );
}

export function buildWorkShiftReport(input: {
  sessions: WorkShiftReportSession[];
  evaluatedAt: Date;
  filters?: WorkShiftReportFilters;
  approvedAdjustmentSessionIds?: ReadonlySet<number>;
}) {
  const filters = input.filters ?? {};
  const approvedAdjustmentSessionIds = input.approvedAdjustmentSessionIds ?? new Set<number>();
  const rows = input.sessions
    .filter(session => matchesFilters(session, input.evaluatedAt, filters))
    .map(session => rowForSession(session, input.evaluatedAt, approvedAdjustmentSessionIds));

  return {
    evaluatedAt: input.evaluatedAt,
    rows,
    summary: summarize(rows),
  };
}
