import { z } from "zod";
import { assertPermission } from "./accessControl";
import { protectedProcedure, router } from "./_core/trpc";
import type { WorkShiftScheduleActor } from "./workShiftScheduleService";

const scheduleScopeInput = z.object({
  organizationId: z.number().int().positive().optional(),
  organizationalUnitId: z.number().int().positive().optional(),
});

const createScheduleInput = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  organizationId: z.number().int().positive(),
  organizationalUnitId: z.number().int().positive().nullable(),
  scheduleType: z.enum(["fixed", "cyclic_12x36", "custom_cycle"]),
  timezone: z.string().trim().min(1).max(64),
  startTimeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  plannedDurationMinutes: z.number().int().positive(),
  breakPolicyMinutes: z.number().int().min(0).nullable(),
  cycleAnchorAt: z.date().nullable(),
  cycleWorkMinutes: z.number().int().positive().nullable(),
  cycleRestMinutes: z.number().int().positive().nullable(),
  effectiveFrom: z.date(),
  effectiveUntil: z.date().nullable(),
});

const assignmentInput = z.object({
  scheduleId: z.number().int().positive(),
  userId: z.number().int().positive(),
  teamId: z.number().int().positive().nullable(),
  effectiveFrom: z.date(),
  effectiveUntil: z.date().nullable(),
});

const exceptionInput = z.object({
  assignmentId: z.number().int().positive(),
  exceptionType: z.enum(["day_off", "replacement_shift", "leave", "extra_call", "holiday_override"]),
  startsAt: z.date(),
  endsAt: z.date(),
  reason: z.string().trim().max(500).nullable(),
});

const resolveForUserInput = z.object({
  userId: z.number().int().positive(),
  instant: z.date(),
});

const coverageInput = z.object({
  from: z.date(),
  until: z.date(),
  organizationId: z.number().int().positive().optional(),
  organizationalUnitId: z.number().int().positive().optional(),
  teamId: z.number().int().positive().optional(),
});

export type WorkShiftSchedulesRouterDependencies = {
  resolveActor(user: NonNullable<Parameters<typeof assertPermission>[0]>): Promise<WorkShiftScheduleActor>;
  listSchedules(input: z.infer<typeof scheduleScopeInput>, actor: WorkShiftScheduleActor): Promise<unknown>;
  createSchedule(input: z.infer<typeof createScheduleInput>, actor: WorkShiftScheduleActor): Promise<unknown>;
  assignSchedule(input: z.infer<typeof assignmentInput>, actor: WorkShiftScheduleActor): Promise<unknown>;
  addException(input: z.infer<typeof exceptionInput>, actor: WorkShiftScheduleActor): Promise<unknown>;
  resolveForUser(input: z.infer<typeof resolveForUserInput>, actor: WorkShiftScheduleActor): Promise<unknown>;
  coverage(input: z.infer<typeof coverageInput>, actor: WorkShiftScheduleActor): Promise<unknown>;
};

export function createWorkShiftSchedulesRouter(deps: WorkShiftSchedulesRouterDependencies) {
  async function actorFor(user: Parameters<typeof assertPermission>[0], permission: "work_shift_schedules.view" | "work_shift_schedules.manage") {
    await assertPermission(user, permission);
    return deps.resolveActor(user);
  }

  return router({
    list: protectedProcedure.input(scheduleScopeInput).query(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_schedules.view");
      return deps.listSchedules(input, actor);
    }),
    create: protectedProcedure.input(createScheduleInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_schedules.manage");
      return deps.createSchedule(input, actor);
    }),
    assign: protectedProcedure.input(assignmentInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_schedules.manage");
      return deps.assignSchedule(input, actor);
    }),
    addException: protectedProcedure.input(exceptionInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_schedules.manage");
      return deps.addException(input, actor);
    }),
    resolveForUser: protectedProcedure.input(resolveForUserInput).query(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_schedules.view");
      return deps.resolveForUser(input, actor);
    }),
    coverage: protectedProcedure.input(coverageInput).query(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_schedules.view");
      return deps.coverage(input, actor);
    }),
  });
}
