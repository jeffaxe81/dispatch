import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import {
  workShiftAssignments,
  workShiftScheduleExceptions,
  workShiftSchedules,
  workShiftSessions,
} from "../drizzle/workShiftSchema";
import type {
  WorkShiftCoverageAssignment,
  WorkShiftCoverageException,
  WorkShiftCoverageSession,
} from "./workShiftCoverageService";

type WorkShiftCoverageDbExecutor = {
  select: (...args: any[]) => any;
};

export type WorkShiftCoverageQuery = {
  from: Date;
  until: Date;
  organizationId?: number;
  organizationalUnitId?: number;
  teamId?: number;
};

export async function loadWorkShiftCoverageData(
  db: WorkShiftCoverageDbExecutor,
  input: WorkShiftCoverageQuery,
): Promise<{
  assignments: WorkShiftCoverageAssignment[];
  exceptions: WorkShiftCoverageException[];
  sessions: WorkShiftCoverageSession[];
}> {
  const assignmentConditions = [
    eq(workShiftAssignments.active, true),
    eq(workShiftSchedules.active, true),
    lt(workShiftAssignments.effectiveFrom, input.until),
    or(isNull(workShiftAssignments.effectiveUntil), gt(workShiftAssignments.effectiveUntil, input.from)),
    lt(workShiftSchedules.effectiveFrom, input.until),
    or(isNull(workShiftSchedules.effectiveUntil), gt(workShiftSchedules.effectiveUntil, input.from)),
  ];
  if (input.organizationId !== undefined) assignmentConditions.push(eq(workShiftSchedules.organizationId, input.organizationId));
  if (input.organizationalUnitId !== undefined) assignmentConditions.push(eq(workShiftSchedules.organizationalUnitId, input.organizationalUnitId));
  if (input.teamId !== undefined) assignmentConditions.push(eq(workShiftAssignments.teamId, input.teamId));

  const assignmentRows = await db
    .select({ assignment: workShiftAssignments, schedule: workShiftSchedules })
    .from(workShiftAssignments)
    .innerJoin(workShiftSchedules, eq(workShiftAssignments.scheduleId, workShiftSchedules.id))
    .where(and(...assignmentConditions))
    .orderBy(workShiftAssignments.effectiveFrom, workShiftAssignments.userId);

  const assignments: WorkShiftCoverageAssignment[] = assignmentRows.map((row: any) => ({
    ...row.assignment,
    schedule: row.schedule,
  }));
  if (assignments.length === 0) return { assignments: [], exceptions: [], sessions: [] };

  const assignmentIds = assignments.map(assignment => assignment.id);
  const userIds = Array.from(new Set(assignments.map(assignment => assignment.userId)));

  const exceptionRows = await db
    .select()
    .from(workShiftScheduleExceptions)
    .where(and(
      inArray(workShiftScheduleExceptions.assignmentId, assignmentIds),
      lt(workShiftScheduleExceptions.startsAt, input.until),
      gt(workShiftScheduleExceptions.endsAt, input.from),
    ))
    .orderBy(workShiftScheduleExceptions.startsAt);

  const sessionRows = await db
    .select({
      id: workShiftSessions.id,
      userId: workShiftSessions.userId,
      scheduleAssignmentId: workShiftSessions.scheduleAssignmentId,
      scheduledStartAt: workShiftSessions.scheduledStartAt,
      scheduledEndAt: workShiftSessions.scheduledEndAt,
      startedAt: workShiftSessions.startedAt,
      endedAt: workShiftSessions.endedAt,
      status: workShiftSessions.status,
    })
    .from(workShiftSessions)
    .where(and(
      inArray(workShiftSessions.userId, userIds),
      lt(workShiftSessions.startedAt, input.until),
      or(
        isNull(workShiftSessions.endedAt),
        gt(workShiftSessions.endedAt, input.from),
        gt(workShiftSessions.scheduledEndAt, input.from),
      ),
    ))
    .orderBy(workShiftSessions.startedAt);

  return {
    assignments,
    exceptions: exceptionRows as WorkShiftCoverageException[],
    sessions: sessionRows as WorkShiftCoverageSession[],
  };
}
