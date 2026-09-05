import { z } from "zod";
import { assertPermission } from "./accessControl";
import { protectedProcedure, router } from "./_core/trpc";

const reportStatus = z.enum(["active", "paused", "ended", "cancelled"]);
const filtersInput = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
  userId: z.number().int().positive().optional(),
  teamId: z.number().int().positive().optional(),
  status: reportStatus.optional(),
}).strict();

const exportInput = filtersInput.extend({
  format: z.enum(["csv", "pdf"]),
}).strict();

export type WorkShiftReportsRouterDependencies = {
  overview(input: z.infer<typeof filtersInput>, user: Parameters<typeof assertPermission>[0]): Promise<unknown>;
  sessions(input: z.infer<typeof filtersInput>, user: Parameters<typeof assertPermission>[0]): Promise<unknown>;
  coverage(input: z.infer<typeof filtersInput>, user: Parameters<typeof assertPermission>[0]): Promise<unknown>;
  exportReport(input: z.infer<typeof exportInput>, user: Parameters<typeof assertPermission>[0]): Promise<unknown>;
};

export function createWorkShiftReportsRouter(deps: WorkShiftReportsRouterDependencies) {
  return router({
    overview: protectedProcedure.input(filtersInput).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "work_shift_reports.view");
      return deps.overview(input, ctx.user);
    }),
    sessions: protectedProcedure.input(filtersInput).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "work_shift_reports.view");
      return deps.sessions(input, ctx.user);
    }),
    coverage: protectedProcedure.input(filtersInput).query(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "work_shift_reports.view");
      return deps.coverage(input, ctx.user);
    }),
    export: protectedProcedure.input(exportInput).mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.user, "work_shift_reports.export");
      return deps.exportReport(input, ctx.user);
    }),
  });
}
