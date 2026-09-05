import { z } from "zod";
import { assertPermission } from "./accessControl";
import { protectedProcedure, router } from "./_core/trpc";

const changesInput = z.object({
  startedAt: z.date().optional(),
  endedAt: z.date().nullable().optional(),
  pausedSeconds: z.number().int().min(0).optional(),
  teamId: z.number().int().positive().nullable().optional(),
  status: z.enum(["active", "paused", "ended", "cancelled"]).optional(),
}).strict();

const listInput = z.object({
  sessionId: z.number().int().positive().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
}).default({});

const requestInput = z.object({
  sessionId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  changes: changesInput,
});

const approveInput = z.object({
  adjustmentId: z.number().int().positive(),
});

const rejectInput = z.object({
  adjustmentId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
});

export type WorkShiftAdjustmentActor = {
  userId: number;
  organizationId: number | null;
  organizationalUnitId: number | null;
  permissions: string[];
};

export type WorkShiftAdjustmentsRouterDependencies = {
  resolveActor(user: NonNullable<Parameters<typeof assertPermission>[0]>): Promise<WorkShiftAdjustmentActor>;
  list(input: z.infer<typeof listInput>, actor: WorkShiftAdjustmentActor): Promise<unknown>;
  request(input: z.infer<typeof requestInput>, actor: WorkShiftAdjustmentActor): Promise<unknown>;
  approve(input: z.infer<typeof approveInput>, actor: WorkShiftAdjustmentActor): Promise<unknown>;
  reject(input: z.infer<typeof rejectInput>, actor: WorkShiftAdjustmentActor): Promise<unknown>;
};

export function createWorkShiftAdjustmentsRouter(deps: WorkShiftAdjustmentsRouterDependencies) {
  async function actorFor(
    user: Parameters<typeof assertPermission>[0],
    permission: "work_shifts.view" | "work_shifts.adjust" | "work_shifts.approve",
  ) {
    await assertPermission(user, permission);
    return deps.resolveActor(user);
  }

  return router({
    list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shifts.view");
      return deps.list(input, actor);
    }),
    request: protectedProcedure.input(requestInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shifts.adjust");
      return deps.request(input, actor);
    }),
    approve: protectedProcedure.input(approveInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shifts.approve");
      return deps.approve(input, actor);
    }),
    reject: protectedProcedure.input(rejectInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shifts.approve");
      return deps.reject(input, actor);
    }),
  });
}
