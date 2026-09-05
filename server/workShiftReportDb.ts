import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { workShiftAdjustments } from "../drizzle/workShiftAdjustmentSchema";
import { workShiftSessions } from "../drizzle/workShiftSchema";
import type { WorkShiftReportFilters, WorkShiftReportSession, WorkShiftReportSummary } from "../shared/workShiftReports";

type WorkShiftReportDbExecutor = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

export function createWorkShiftReportDb(db: WorkShiftReportDbExecutor) {
  return {
    async listSessions(filters: WorkShiftReportFilters = {}): Promise<WorkShiftReportSession[]> {
      const conditions = [];
      if (filters.from) {
        conditions.push(or(isNull(workShiftSessions.endedAt), gte(workShiftSessions.endedAt, filters.from)));
      }
      if (filters.to) conditions.push(lte(workShiftSessions.startedAt, filters.to));
      if (filters.userId !== undefined) conditions.push(eq(workShiftSessions.userId, filters.userId));
      if (filters.teamId !== undefined) conditions.push(eq(workShiftSessions.teamId, filters.teamId));
      if (filters.status !== undefined) conditions.push(eq(workShiftSessions.status, filters.status));

      const rows = await db
        .select({
          id: workShiftSessions.id,
          userId: workShiftSessions.userId,
          teamId: workShiftSessions.teamId,
          scheduleAssignmentId: workShiftSessions.scheduleAssignmentId,
          scheduledStartAt: workShiftSessions.scheduledStartAt,
          scheduledEndAt: workShiftSessions.scheduledEndAt,
          startedAt: workShiftSessions.startedAt,
          pausedAt: workShiftSessions.pausedAt,
          endedAt: workShiftSessions.endedAt,
          status: workShiftSessions.status,
          pausedSeconds: workShiftSessions.pausedSeconds,
          workedSeconds: workShiftSessions.workedSeconds,
          overtimeSeconds: workShiftSessions.overtimeSeconds,
          lateStartSeconds: workShiftSessions.lateStartSeconds,
          earlyEndSeconds: workShiftSessions.earlyEndSeconds,
        })
        .from(workShiftSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(workShiftSessions.startedAt, workShiftSessions.id);

      return rows as WorkShiftReportSession[];
    },

    async listApprovedAdjustmentSessionIds(sessionIds: number[]): Promise<Set<number>> {
      if (sessionIds.length === 0) return new Set<number>();
      const rows = await db
        .select({ sessionId: workShiftAdjustments.sessionId })
        .from(workShiftAdjustments)
        .where(and(
          inArray(workShiftAdjustments.sessionId, sessionIds),
          eq(workShiftAdjustments.status, "approved"),
        ));
      return new Set(rows.map((row: { sessionId: number }) => row.sessionId));
    },

    async auditExport(input: {
      actorUserId: number;
      format: "csv" | "pdf";
      filters: WorkShiftReportFilters;
      summary: WorkShiftReportSummary;
      rowCount: number;
    }): Promise<void> {
      await db.insert(auditLogs).values({
        resourceType: "work_shift_report",
        resourceId: 0,
        action: "export",
        actorUserId: input.actorUserId,
        beforeData: null,
        afterData: {
          format: input.format,
          filters: {
            from: input.filters.from?.toISOString() ?? null,
            to: input.filters.to?.toISOString() ?? null,
            userId: input.filters.userId ?? null,
            teamId: input.filters.teamId ?? null,
            status: input.filters.status ?? null,
          },
          summary: input.summary,
          rowCount: input.rowCount,
        },
      });
    },
  };
}
