import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "../dbLegacy";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";
import { workflowTasks } from "./workflowTaskSchema";
import type { WorkflowSlaManualCandidateSource } from "./workflowSlaManualWorker";

type WorkflowDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Manual due-intent discovery only. No joins to a cross-domain incident DB.
 * The execution-to-tenant binding is rechecked even though the SLA ledger
 * already stores organizationId.
 */
export function createWorkflowSlaManualCandidateMySql(
  db: WorkflowDb,
): WorkflowSlaManualCandidateSource {
  return {
    async listDueIntentIds({ organizationId, now, limit }) {
      if (!Number.isSafeInteger(organizationId) || organizationId < 1
        || !Number.isSafeInteger(limit) || limit < 1 || limit > 20
        || typeof now !== "string" || !Number.isFinite(Date.parse(now))
        || new Date(Date.parse(now)).toISOString() !== now) {
        throw new Error("Parâmetros inválidos para consulta manual SLA.");
      }
      const nowDate = new Date(now);
      const nowMs = nowDate.getTime();

      const rows = await db.select({ intentId: workflowSlaEventIntents.id })
        .from(workflowSlaEventIntents)
        .innerJoin(workflowTasks, eq(workflowTasks.id, workflowSlaEventIntents.taskId))
        .innerJoin(
          workflowExecutionTenantScopes,
          eq(workflowExecutionTenantScopes.executionId, workflowTasks.executionId),
        )
        .where(and(
          eq(workflowSlaEventIntents.organizationId, organizationId),
          eq(workflowExecutionTenantScopes.organizationId, organizationId),
          inArray(workflowTasks.status, ["open", "in_progress"]),
          lte(workflowSlaEventIntents.scheduledAt, nowDate),
          or(
            and(
              eq(workflowSlaEventIntents.status, "pending"),
              or(
                isNull(workflowSlaEventIntents.nextAttemptAtMs),
                lte(workflowSlaEventIntents.nextAttemptAtMs, nowMs),
              ),
            ),
            and(
              eq(workflowSlaEventIntents.status, "leased"),
              lte(workflowSlaEventIntents.leaseExpiresAtMs, nowMs),
            ),
          ),
        ))
        .orderBy(
          asc(workflowSlaEventIntents.scheduledAt),
          asc(workflowSlaEventIntents.id),
        )
        .limit(limit);
      return rows.map(row => row.intentId);
    },
  };
}
