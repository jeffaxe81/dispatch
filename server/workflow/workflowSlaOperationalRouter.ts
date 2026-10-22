import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertPermission } from "../accessControl";
import type { TrpcContext } from "../_core/context";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../dbLegacy";
import { requireActiveTenant } from "../tenantOperational";
import { createWorkflowSlaOperationalReadModel, type WorkflowSlaOperationalItem } from "./workflowSlaOperationalReadModel";
import { createWorkflowSlaOperationalReadMySql } from "./workflowSlaOperationalReadMySql";
import {
  evaluateSlaDiagnosticPreview,
  slaDiagnosticPreviewMode,
  type ScopedSlaProbeEvidence,
} from "./workflowSlaDiagnosticPreview";
import { createWorkflowSlaOperationalMetricsMySql } from "./workflowSlaOperationalMetricsMySql";
import type { WorkflowSlaOperationalMetrics } from "./workflowSlaOperationalMetrics";

type User = NonNullable<TrpcContext["user"]>;

export type WorkflowSlaOperationalRouterDependencies = {
  assertPermission(user: User, permission: string): Promise<void>;
  requireActiveTenant(user: User, req: TrpcContext["req"]): Promise<number>;
  list(input: { organizationId: number; limit: number; now: string }): Promise<WorkflowSlaOperationalItem[]>;
  now(): string;
  metrics?(input: { organizationId: number; now: string }): Promise<WorkflowSlaOperationalMetrics>;
  readinessPreviewMode?(): "disabled" | "manual_homologation";
  schedulerProbe?(input: { organizationId: number; now: string }): Promise<ScopedSlaProbeEvidence>;
  adapterProbe?(input: { organizationId: number; now: string }): Promise<ScopedSlaProbeEvidence>;
};

export const workflowSlaOperationalRouterDependencies: WorkflowSlaOperationalRouterDependencies = {
  assertPermission,
  requireActiveTenant,
  async list(input) {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para leitura operacional SLA.");
    return createWorkflowSlaOperationalReadModel(
      createWorkflowSlaOperationalReadMySql(db),
    ).list(input);
  },
  now: () => new Date().toISOString(),
  readinessPreviewMode: () => slaDiagnosticPreviewMode(process.env),
  async metrics(input) {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para métricas SLA.");
    return createWorkflowSlaOperationalMetricsMySql(db).summarize(input);
  },
};

export function createWorkflowSlaOperationalRouter(
  deps: WorkflowSlaOperationalRouterDependencies = workflowSlaOperationalRouterDependencies,
) {
  return router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).strict())
      .query(async ({ ctx, input }) => {
        if (!ctx.user?.active) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
        }
        await deps.assertPermission(ctx.user, "workflow_tasks.view");
        const organizationId = await deps.requireActiveTenant(ctx.user, ctx.req);
        return deps.list({
          organizationId,
          limit: input.limit,
          now: deps.now(),
        });
      }),
    metrics: protectedProcedure
      .input(z.object({}).strict())
      .query(async ({ ctx }) => {
        if (!ctx.user?.active) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
        }
        await deps.assertPermission(ctx.user, "workflow_tasks.view");
        const organizationId = await deps.requireActiveTenant(ctx.user, ctx.req);
        if (!deps.metrics) throw new Error("Agregador SLA indisponível.");
        return deps.metrics({ organizationId, now: deps.now() });
      }),
    diagnostic: protectedProcedure
      .input(z.object({}).strict())
      .query(async ({ ctx }) => {
        if (!ctx.user?.active) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
        }
        await deps.assertPermission(ctx.user, "workflow_tasks.view");
        const organizationId = await deps.requireActiveTenant(ctx.user, ctx.req);
        const mode = deps.readinessPreviewMode?.() ?? "disabled";
        return evaluateSlaDiagnosticPreview({
          organizationId,
          now: deps.now(),
          mode,
          dependencies: {
            // The complete tenant aggregate is the only authorized metrics source.
            metrics: async input => {
              if (!deps.metrics) throw new Error("Agregador SLA indisponível.");
              return deps.metrics(input);
            },
            schedulerProbe: deps.schedulerProbe,
            adapterProbe: deps.adapterProbe,
          },
        });
      }),
  });
}
