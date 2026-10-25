import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertIntegrationApprovalAdministrator, assertPermission } from "../accessControl";
import type { TrpcContext } from "../_core/context";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../dbLegacy";
import { requireActiveTenant } from "../tenantOperational";
import { createWorkflowSlaAdminReplayService } from "./workflowSlaAdminReplay";
import { createWorkflowSlaAdminReplayMySqlStore } from "./workflowSlaAdminReplayMySql";

type User = NonNullable<TrpcContext["user"]>;

export type WorkflowSlaAdminReplayRouterDependencies = {
  enabled(): boolean;
  assertPermission(user: User, permission: string): Promise<void>;
  assertAdministrator(user: User): Promise<void>;
  requireActiveTenant(user: User, req: TrpcContext["req"]): Promise<number>;
  replay(input: {
    intentId: number;
    organizationId: number;
    actorUserId: number;
    reason: string;
    administratorApproved: true;
    now: string;
  }): Promise<{
    intentId: number;
    organizationId: number;
    status: "pending";
    version: number;
  }>;
  now(): string;
};

export const workflowSlaAdminReplayRouterDependencies: WorkflowSlaAdminReplayRouterDependencies = {
  enabled: () =>
    process.env.AXE_RUNTIME_ENV === "homologation" &&
    process.env.AXE_SLA_I5F_ENABLED === "true",
  assertPermission,
  assertAdministrator: assertIntegrationApprovalAdministrator,
  requireActiveTenant,
  async replay(input) {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para replay administrativo SLA.");
    return createWorkflowSlaAdminReplayService(
      createWorkflowSlaAdminReplayMySqlStore(db),
    ).replay(input);
  },
  now: () => new Date().toISOString(),
};

export function createWorkflowSlaAdminReplayRouter(
  deps: WorkflowSlaAdminReplayRouterDependencies = workflowSlaAdminReplayRouterDependencies,
) {
  return router({
    replay: protectedProcedure
      .input(
        z.object({
          intentId: z.number().int().positive(),
          reason: z.string().trim().min(3).max(1000),
        }).strict(),
      )
      .mutation(async ({ ctx, input }) => {
        if (!deps.enabled()) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Replay administrativo SLA desabilitado.",
          });
        }
        if (!ctx.user?.active) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Usuário operacional inativo.",
          });
        }
        await deps.assertPermission(ctx.user, "workflow.execute");
        await deps.assertAdministrator(ctx.user);
        const organizationId = await deps.requireActiveTenant(ctx.user, ctx.req);
        return deps.replay({
          intentId: input.intentId,
          organizationId,
          actorUserId: ctx.user.id,
          reason: input.reason,
          administratorApproved: true,
          now: deps.now(),
        });
      }),
  });
}
