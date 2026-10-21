import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../dbLegacy";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import type { WorkflowSlaOperationalReadStore } from "./workflowSlaOperationalReadModel";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";
import { workflowTasks } from "./workflowTaskSchema";

type WorkflowDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function validInput(input: { organizationId: number; limit: number; now: string }) {
  return Number.isSafeInteger(input.organizationId) &&
    input.organizationId > 0 &&
    Number.isSafeInteger(input.limit) &&
    input.limit > 0 &&
    input.limit <= 100 &&
    typeof input.now === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.now) &&
    Number.isFinite(Date.parse(input.now)) &&
    new Date(Date.parse(input.now)).toISOString() === input.now;
}

export function createWorkflowSlaOperationalReadMySql(
  db: WorkflowDb,
): WorkflowSlaOperationalReadStore {
  return {
    async list(input) {
      if (!validInput(input)) throw new Error("Parâmetros inválidos para consulta operacional SLA.");

      const rows = await db
        .select({
          intentId: workflowSlaEventIntents.id,
          taskId: workflowSlaEventIntents.taskId,
          organizationId: workflowSlaEventIntents.organizationId,
          eventKind: workflowSlaEventIntents.eventKind,
          deliveryStatus: workflowSlaEventIntents.status,
          taskStatus: workflowTasks.status,
          assigneeUserId: workflowTasks.assigneeUserId,
          scheduledAt: workflowSlaEventIntents.scheduledAt,
          correlationId: workflowSlaEventIntents.correlationId,
          attempts: workflowSlaEventIntents.deliveryAttempts,
        })
        .from(workflowSlaEventIntents)
        .innerJoin(workflowTasks, eq(workflowTasks.id, workflowSlaEventIntents.taskId))
        .innerJoin(
          workflowExecutionTenantScopes,
          eq(workflowExecutionTenantScopes.executionId, workflowTasks.executionId),
        )
        .where(and(
          eq(workflowSlaEventIntents.organizationId, input.organizationId),
          eq(workflowExecutionTenantScopes.organizationId, input.organizationId),
          inArray(workflowTasks.status, ["open", "in_progress"]),
          eq(workflowTasks.workflowVersionId, workflowSlaEventIntents.workflowVersionId),
          eq(workflowTasks.nodeId, workflowSlaEventIntents.nodeId),
          inArray(workflowSlaEventIntents.status, ["pending", "leased", "dead_letter"]),
        ))
        .orderBy(
          asc(workflowSlaEventIntents.scheduledAt),
          asc(workflowSlaEventIntents.id),
        )
        .limit(input.limit);

      return rows.map(row => ({
        intentId: row.intentId,
        taskId: row.taskId,
        organizationId: row.organizationId,
        eventKind: row.eventKind,
        deliveryStatus: row.deliveryStatus as "pending" | "leased" | "dead_letter",
        taskStatus: row.taskStatus as "open" | "in_progress",
        assigneeUserId: row.assigneeUserId,
        scheduledAt: row.scheduledAt.toISOString(),
        correlationId: row.correlationId,
        attempts: row.attempts,
      }));
    },
  };
}
