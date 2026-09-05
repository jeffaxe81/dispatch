import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { assertWorkShiftOperationsManage, assertWorkShiftOperationsView } from "./workShiftOperationsAccess";

const pendingStatus = z.enum(["open", "in_review", "waiting_information", "resolved", "no_adjustment_required"]);
const anomalySeverity = z.enum(["info", "warning", "critical"]);

export type WorkShiftOperationsRouterDependencies = {
  list(input: { tenantId: number; teamId?: number; status?: z.infer<typeof pendingStatus> }): Promise<unknown>;
  summary(input: { tenantId: number; teamId?: number }): Promise<unknown>;
  claim(input: { tenantId: number; pendingId: number; actorUserId: number; expectedVersion: number }): Promise<unknown>;
  setStatus(input: { tenantId: number; pendingId: number; actorUserId: number; expectedVersion: number; status: z.infer<typeof pendingStatus>; justification?: string }): Promise<unknown>;
  resolve(input: { tenantId: number; pendingId: number; actorUserId: number; expectedVersion: number; resolution: "resolved" | "no_adjustment_required"; justification: string; adjustment?: unknown }): Promise<unknown>;
  listSlaPolicies(input: { tenantId: number }): Promise<unknown>;
  upsertSlaPolicy(input: { tenantId: number; actorUserId: number; anomalyType?: string; severity?: z.infer<typeof anomalySeverity>; warningAfterMinutes?: number; criticalAfterMinutes: number; escalationAfterMinutes?: number }): Promise<unknown>;
};

export function createWorkShiftOperationsRouter(deps: WorkShiftOperationsRouterDependencies) {
  const operationalProcedure = protectedProcedure;

  return router({
    list: operationalProcedure.input(z.object({ teamId: z.number().int().positive().optional(), status: pendingStatus.optional() })).query(async ({ ctx, input }) => {
      await assertWorkShiftOperationsView(ctx.user, input.teamId);
      return deps.list({ tenantId: ctx.user.organizationId, ...input });
    }),
    summary: operationalProcedure.input(z.object({ teamId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
      await assertWorkShiftOperationsView(ctx.user, input.teamId);
      return deps.summary({ tenantId: ctx.user.organizationId, ...input });
    }),
    claim: operationalProcedure.input(z.object({ pendingId: z.number().int().positive(), teamId: z.number().int().positive().optional(), expectedVersion: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await assertWorkShiftOperationsManage(ctx.user, input.teamId);
      return deps.claim({ tenantId: ctx.user.organizationId, pendingId: input.pendingId, actorUserId: ctx.user.id, expectedVersion: input.expectedVersion });
    }),
    setStatus: operationalProcedure.input(z.object({ pendingId: z.number().int().positive(), teamId: z.number().int().positive().optional(), expectedVersion: z.number().int().positive(), status: pendingStatus, justification: z.string().trim().min(3).max(2000).optional() })).mutation(async ({ ctx, input }) => {
      await assertWorkShiftOperationsManage(ctx.user, input.teamId);
      return deps.setStatus({ tenantId: ctx.user.organizationId, pendingId: input.pendingId, actorUserId: ctx.user.id, expectedVersion: input.expectedVersion, status: input.status, justification: input.justification });
    }),
    resolve: operationalProcedure.input(z.object({ pendingId: z.number().int().positive(), teamId: z.number().int().positive().optional(), expectedVersion: z.number().int().positive(), resolution: z.enum(["resolved", "no_adjustment_required"]), justification: z.string().trim().min(3).max(2000), adjustment: z.unknown().optional() })).mutation(async ({ ctx, input }) => {
      await assertWorkShiftOperationsManage(ctx.user, input.teamId);
      return deps.resolve({ tenantId: ctx.user.organizationId, pendingId: input.pendingId, actorUserId: ctx.user.id, expectedVersion: input.expectedVersion, resolution: input.resolution, justification: input.justification, adjustment: input.adjustment });
    }),
    slaPolicies: router({
      list: operationalProcedure.query(async ({ ctx }) => {
        await assertWorkShiftOperationsView(ctx.user);
        return deps.listSlaPolicies({ tenantId: ctx.user.organizationId });
      }),
      upsert: operationalProcedure.input(z.object({ anomalyType: z.string().trim().min(2).max(48).optional(), severity: anomalySeverity.optional(), warningAfterMinutes: z.number().int().nonnegative().optional(), criticalAfterMinutes: z.number().int().positive(), escalationAfterMinutes: z.number().int().nonnegative().optional() })).mutation(async ({ ctx, input }) => {
        await assertWorkShiftOperationsManage(ctx.user);
        return deps.upsertSlaPolicy({ tenantId: ctx.user.organizationId, actorUserId: ctx.user.id, ...input });
      }),
    }),
  });
}
