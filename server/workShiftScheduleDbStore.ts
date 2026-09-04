import { and, desc, eq, gt, isNull, lt, lte, or } from "drizzle-orm";
import {
  workShiftAssignments,
  workShiftScheduleExceptions,
  workShiftSchedules,
} from "../drizzle/workShiftSchema";
import type { WorkShiftScheduleStore } from "./workShiftScheduleService";

type WorkShiftScheduleDbExecutor = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

export function createWorkShiftScheduleDbStore(db: WorkShiftScheduleDbExecutor): WorkShiftScheduleStore {
  return {
    async findAssignmentsForUser(userId, from, until) {
      return db
        .select()
        .from(workShiftAssignments)
        .where(and(
          eq(workShiftAssignments.userId, userId),
          eq(workShiftAssignments.active, true),
          lt(workShiftAssignments.effectiveFrom, until),
          or(
            isNull(workShiftAssignments.effectiveUntil),
            gt(workShiftAssignments.effectiveUntil, from),
          ),
        ))
        .orderBy(workShiftAssignments.effectiveFrom);
    },

    async findEffectiveAssignment(userId, instant) {
      return (
        await db
          .select()
          .from(workShiftAssignments)
          .where(and(
            eq(workShiftAssignments.userId, userId),
            eq(workShiftAssignments.active, true),
            lte(workShiftAssignments.effectiveFrom, instant),
            or(
              isNull(workShiftAssignments.effectiveUntil),
              gt(workShiftAssignments.effectiveUntil, instant),
            ),
          ))
          .orderBy(desc(workShiftAssignments.effectiveFrom))
          .limit(1)
      )[0] ?? null;
    },

    async findAssignmentById(assignmentId) {
      return (
        await db
          .select()
          .from(workShiftAssignments)
          .where(eq(workShiftAssignments.id, assignmentId))
          .limit(1)
      )[0] ?? null;
    },

    async findScheduleById(scheduleId) {
      return (
        await db
          .select()
          .from(workShiftSchedules)
          .where(eq(workShiftSchedules.id, scheduleId))
          .limit(1)
      )[0] ?? null;
    },

    async findExceptions(assignmentId, from, until) {
      return db
        .select()
        .from(workShiftScheduleExceptions)
        .where(and(
          eq(workShiftScheduleExceptions.assignmentId, assignmentId),
          lt(workShiftScheduleExceptions.startsAt, until),
          gt(workShiftScheduleExceptions.endsAt, from),
        ))
        .orderBy(workShiftScheduleExceptions.startsAt);
    },

    async insertAssignment(input) {
      const [createdId] = await db
        .insert(workShiftAssignments)
        .values({ ...input, active: true })
        .$returningId();
      if (!createdId) throw new Error("Falha ao persistir associação de escala.");

      const created = (
        await db
          .select()
          .from(workShiftAssignments)
          .where(eq(workShiftAssignments.id, createdId.id))
          .limit(1)
      )[0];
      if (!created) throw new Error("Associação de escala persistida não encontrada.");
      return created;
    },

    async insertException(input) {
      const [createdId] = await db
        .insert(workShiftScheduleExceptions)
        .values(input)
        .$returningId();
      if (!createdId) throw new Error("Falha ao persistir exceção de escala.");

      const created = (
        await db
          .select()
          .from(workShiftScheduleExceptions)
          .where(eq(workShiftScheduleExceptions.id, createdId.id))
          .limit(1)
      )[0];
      if (!created) throw new Error("Exceção de escala persistida não encontrada.");
      return created;
    },
  };
}
