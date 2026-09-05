import { z } from "zod";
import { assertPermission } from "./accessControl";
import { protectedProcedure, router } from "./_core/trpc";

const listInput = z.object({
  status: z.enum(["open", "acknowledged", "resolved"]).optional(),
  userId: z.number().int().positive().optional(),
  teamId: z.number().int().positive().optional(),
  sessionId: z.number().int().positive().optional(),
}).default({});

const evaluateInput = z.object({
  sessionId: z.number().int().positive(),
});

const transitionInput = z.object({
  alertId: z.number().int().positive(),
});

export type WorkShiftAlertActor = {
  userId: number;
  organizationId: number | null;
  organizationalUnitId: number | null;
  permissions: string[];
};

export type WorkShiftAlertsRouterDependencies = {
  resolveActor(user: NonNullable<Parameters<typeof assertPermission>[0]>): Promise<WorkShiftAlertActor>;
  list(input: z.infer<typeof listInput>, actor: WorkShiftAlertActor): Promise<unknown>;
  evaluate(input: z.infer<typeof evaluateInput>, actor: WorkShiftAlertActor): Promise<unknown>;
  acknowledge(input: z.infer<typeof transitionInput>, actor: WorkShiftAlertActor): Promise<unknown>;
  resolve(input: z.infer<typeof transitionInput>, actor: WorkShiftAlertActor): Promise<unknown>;
};

export function createWorkShiftAlertsRouter(deps: WorkShiftAlertsRouterDependencies) {
  async function actorFor(
    user: Parameters<typeof assertPermission>[0],
    permission: "work_shift_alerts.view" | "work_shift_alerts.manage",
  ) {
    await assertPermission(user, permission);
    return deps.resolveActor(user);
  }

  return router({
    list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_alerts.view");
      return deps.list(input, actor);
    }),
    evaluate: protectedProcedure.input(evaluateInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_alerts.manage");
      return deps.evaluate(input, actor);
    }),
    acknowledge: protectedProcedure.input(transitionInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_alerts.manage");
      return deps.acknowledge(input, actor);
    }),
    resolve: protectedProcedure.input(transitionInput).mutation(async ({ ctx, input }) => {
      const actor = await actorFor(ctx.user, "work_shift_alerts.manage");
      return deps.resolve(input, actor);
    }),
  });
}
