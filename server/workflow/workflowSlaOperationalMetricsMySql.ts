import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../dbLegacy";
import { workflowSlaEventIntents as intents } from "./workflowSlaEventIntentSchema";
import type { WorkflowSlaOperationalMetrics } from "./workflowSlaOperationalMetrics";
import { workflowExecutionTenantScopes as scopes } from "./workflowTenantScopeSchema";
import { workflowTasks as tasks } from "./workflowTaskSchema";

type WorkflowDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type CountValue = string | number | null;

function strictUtc(value: string): number {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("now deve ser UTC ISO-8601 com milissegundos.");
  }
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms) || ms < 0 || new Date(ms).toISOString() !== value) {
    throw new Error("Relógio SLA UTC inválido.");
  }
  return ms;
}

function count(value: CountValue, field: string): number {
  if (value === null || value === "" || typeof value === "boolean") {
    throw new Error(`Contador SLA ${field} ausente.`);
  }
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`Contador SLA ${field} inválido.`);
  }
  return numeric;
}

/**
 * Aggregate of the full matching tenant set, not the capped UI listing.
 * MySQL TIMESTAMP/UNIX_TIMESTAMP use epoch seconds; lease/retry fields use ms.
 * Existing UTC database-session validation remains a deployment gate.
 */
export function createWorkflowSlaOperationalMetricsMySql(db: WorkflowDb) {
  return {
    async summarize(input: {
      organizationId: number;
      now: string;
    }): Promise<WorkflowSlaOperationalMetrics> {
      if (!Number.isSafeInteger(input.organizationId) || input.organizationId < 1) {
        throw new Error("organizationId SLA inválido.");
      }
      const nowMs = strictUtc(input.now);
      const due = sql`UNIX_TIMESTAMP(${intents.scheduledAt}) * 1000 <= ${nowMs}`;
      const lag = sql`FLOOR((${nowMs} - UNIX_TIMESTAMP(${intents.scheduledAt}) * 1000) / 60000)`;
      const results = await db.select({
        pending: sql<CountValue>`COALESCE(SUM(CASE WHEN ${intents.status} = 'pending' THEN 1 ELSE 0 END), 0)`,
        leased: sql<CountValue>`COALESCE(SUM(CASE WHEN ${intents.status} = 'leased' THEN 1 ELSE 0 END), 0)`,
        deadLetter: sql<CountValue>`COALESCE(SUM(CASE WHEN ${intents.status} = 'dead_letter' THEN 1 ELSE 0 END), 0)`,
        expiredLeases: sql<CountValue>`COALESCE(SUM(CASE WHEN ${intents.status} = 'leased'
          AND ${intents.leaseExpiresAtMs} IS NOT NULL AND ${intents.leaseExpiresAtMs} <= ${nowMs}
          THEN 1 ELSE 0 END), 0)`,
        waitingRetries: sql<CountValue>`COALESCE(SUM(CASE WHEN ${intents.status} = 'pending'
          AND ${intents.nextAttemptAtMs} IS NOT NULL AND ${intents.nextAttemptAtMs} > ${nowMs}
          THEN 1 ELSE 0 END), 0)`,
        overdue: sql<CountValue>`COALESCE(SUM(CASE WHEN ${due} THEN 1 ELSE 0 END), 0)`,
        maxLagMinutes: sql<CountValue>`COALESCE(MAX(CASE WHEN ${due} THEN ${lag} ELSE 0 END), 0)`,
      })
        .from(intents)
        .innerJoin(tasks, eq(tasks.id, intents.taskId))
        .innerJoin(scopes, eq(scopes.executionId, tasks.executionId))
        .where(and(
          eq(intents.organizationId, input.organizationId),
          eq(scopes.organizationId, input.organizationId),
          inArray(tasks.status, ["open", "in_progress"]),
          eq(tasks.workflowVersionId, intents.workflowVersionId),
          eq(tasks.nodeId, intents.nodeId),
          inArray(intents.status, ["pending", "leased", "dead_letter"]),
        ));

      if (results.length !== 1) throw new Error("Agregação SLA retornou cardinalidade inválida.");
      const row = results[0];
      const metrics = {
        pending: count(row.pending, "pending"),
        leased: count(row.leased, "leased"),
        deadLetter: count(row.deadLetter, "deadLetter"),
        expiredLeases: count(row.expiredLeases, "expiredLeases"),
        waitingRetries: count(row.waitingRetries, "waitingRetries"),
        overdue: count(row.overdue, "overdue"),
        maxLagMinutes: count(row.maxLagMinutes, "maxLagMinutes"),
        generatedAt: input.now,
      };

      const total = metrics.pending + metrics.leased + metrics.deadLetter;
      if (!Number.isSafeInteger(total) ||
        metrics.expiredLeases > metrics.leased ||
        metrics.waitingRetries > metrics.pending ||
        metrics.overdue > total) {
        throw new Error("Agregação SLA inconsistente.");
      }
      return metrics;
    },
  };
}
