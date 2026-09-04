import type { WorkShiftExceptionType, WorkShiftScheduleType } from "../shared/workShiftSchedules";
import { applyScheduleExceptions, resolvePlannedShift } from "./workShiftScheduleDomain";

export type WorkShiftScheduleRecord = {
  id: number;
  code: string;
  name: string;
  organizationId: number;
  organizationalUnitId: number | null;
  scheduleType: WorkShiftScheduleType;
  timezone: string;
  startTimeLocal: string;
  weekdays: number[] | null;
  plannedDurationMinutes: number;
  breakPolicyMinutes: number | null;
  cycleAnchorAt: Date | null;
  cycleWorkMinutes: number | null;
  cycleRestMinutes: number | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
};

export type WorkShiftAssignmentRecord = {
  id: number;
  scheduleId: number;
  userId: number;
  teamId: number | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
};

export type WorkShiftScheduleExceptionRecord = {
  id: number;
  assignmentId: number;
  exceptionType: WorkShiftExceptionType;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdByUserId: number;
  createdAt: Date;
};

export type NewWorkShiftAssignment = Omit<WorkShiftAssignmentRecord, "id" | "active">;
export type NewWorkShiftScheduleException = Omit<WorkShiftScheduleExceptionRecord, "id" | "createdAt">;

export type WorkShiftScheduleActor = {
  userId: number;
  organizationId: number | null;
  organizationalUnitId: number | null;
  permissions: string[];
};

export type ResolvedUserWorkShiftPlan = {
  assignmentId: number;
  scheduleId: number;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  inPlannedWindow: boolean;
  source: "schedule" | "exception" | "none";
};

export type WorkShiftScheduleStore = {
  findAssignmentsForUser(userId: number, from: Date, until: Date): Promise<WorkShiftAssignmentRecord[]>;
  findEffectiveAssignment(userId: number, instant: Date): Promise<WorkShiftAssignmentRecord | null>;
  findScheduleById(scheduleId: number): Promise<WorkShiftScheduleRecord | null>;
  findExceptions(assignmentId: number, from: Date, until: Date): Promise<WorkShiftScheduleExceptionRecord[]>;
  insertAssignment(input: NewWorkShiftAssignment): Promise<WorkShiftAssignmentRecord>;
  insertException(input: NewWorkShiftScheduleException): Promise<WorkShiftScheduleExceptionRecord>;
};

export class WorkShiftAssignmentOverlapError extends Error {
  readonly code = "WORK_SHIFT_ASSIGNMENT_OVERLAP";

  constructor() {
    super("Já existe uma associação de escala ativa e sobreposta para este usuário.");
    this.name = "WorkShiftAssignmentOverlapError";
  }
}

function assertValidPeriod(from: Date, until: Date | null, startLabel = "effectiveFrom", endLabel = "effectiveUntil") {
  if (Number.isNaN(from.getTime())) throw new Error(`${startLabel} inválido`);
  if (until && Number.isNaN(until.getTime())) throw new Error(`${endLabel} inválido`);
  if (until && from >= until) throw new Error(`${startLabel} deve ser anterior a ${endLabel}`);
}

function assertManagePermission(actor: WorkShiftScheduleActor) {
  if (!actor.permissions.includes("*") && !actor.permissions.includes("work_shift_schedules.manage")) {
    throw new Error("Permissão work_shift_schedules.manage obrigatória.");
  }
}

function assertScheduleScope(schedule: WorkShiftScheduleRecord, actor: WorkShiftScheduleActor) {
  if (actor.permissions.includes("*")) return;
  if (actor.organizationId !== schedule.organizationId) throw new Error("Escala fora do escopo organizacional autorizado.");
  if (actor.organizationalUnitId !== null && schedule.organizationalUnitId !== actor.organizationalUnitId) {
    throw new Error("Escala fora da unidade organizacional autorizada.");
  }
}

export function createWorkShiftScheduleService(store: WorkShiftScheduleStore) {
  return {
    async createAssignment(
      input: {
        scheduleId: number;
        userId: number;
        teamId: number | null;
        effectiveFrom: Date;
        effectiveUntil: Date | null;
      },
      actor: WorkShiftScheduleActor,
    ) {
      assertManagePermission(actor);
      assertValidPeriod(input.effectiveFrom, input.effectiveUntil);

      const schedule = await store.findScheduleById(input.scheduleId);
      if (!schedule || !schedule.active) throw new Error("Escala não encontrada ou inativa.");
      assertScheduleScope(schedule, actor);

      const overlapUntil = input.effectiveUntil ?? new Date("9999-12-31T23:59:59.999Z");
      const overlaps = await store.findAssignmentsForUser(input.userId, input.effectiveFrom, overlapUntil);
      if (overlaps.length > 0) throw new WorkShiftAssignmentOverlapError();

      return store.insertAssignment({
        scheduleId: input.scheduleId,
        userId: input.userId,
        teamId: input.teamId,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
      });
    },

    async createException(
      input: {
        assignmentId: number;
        exceptionType: WorkShiftExceptionType;
        startsAt: Date;
        endsAt: Date;
        reason: string | null;
      },
      actor: WorkShiftScheduleActor,
    ) {
      assertManagePermission(actor);
      assertValidPeriod(input.startsAt, input.endsAt, "startsAt", "endsAt");

      return store.insertException({
        assignmentId: input.assignmentId,
        exceptionType: input.exceptionType,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
        createdByUserId: actor.userId,
      });
    },

    async resolveForUser(userId: number, instant: Date): Promise<ResolvedUserWorkShiftPlan | null> {
      if (Number.isNaN(instant.getTime())) throw new Error("instant inválido");

      const assignment = await store.findEffectiveAssignment(userId, instant);
      if (!assignment) return null;

      const schedule = await store.findScheduleById(assignment.scheduleId);
      if (!schedule || !schedule.active) return null;

      const baseWindow = resolvePlannedShift(schedule, instant);
      const searchFrom = new Date(instant.getTime() - 48 * 60 * 60_000);
      const searchUntil = new Date(instant.getTime() + 48 * 60 * 60_000);
      const exceptions = await store.findExceptions(assignment.id, searchFrom, searchUntil);
      const resolved = applyScheduleExceptions(baseWindow, exceptions);

      return {
        assignmentId: assignment.id,
        scheduleId: assignment.scheduleId,
        plannedStartAt: resolved.plannedStartAt,
        plannedEndAt: resolved.plannedEndAt,
        inPlannedWindow: resolved.inPlannedWindow,
        source: resolved.source,
      };
    },
  };
}
