import { and, eq } from "drizzle-orm";
import { auditLogs } from "../../drizzle/schema";
import { getDb } from "../dbLegacy";
import {
  type WorkflowSlaAdminReplaySnapshot,
  type WorkflowSlaAdminReplayStore,
} from "./workflowSlaAdminReplay";
import { WorkflowSlaDeliveryConflictError } from "./workflowSlaDeliveryCoordinator";
import { hydrateWorkflowSlaIntent } from "./workflowSlaDeliveryMySql";
import { assertWorkflowSlaDeliveryState } from "./workflowSlaDeliveryState";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import { workflowTasks } from "./workflowTaskSchema";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";

type WorkflowDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;

export function createWorkflowSlaAdminReplayMySqlStore(
  db: WorkflowDb,
): WorkflowSlaAdminReplayStore {
  return {
    transaction: callback =>
      db.transaction(async tx => {
        let loaded: WorkflowSlaAdminReplaySnapshot | null = null;
        let workflowVersionId = 0;
        let nodeId = "";

        return callback({
          async loadForUpdate({ intentId, organizationId }) {
            if (
              !Number.isSafeInteger(intentId) ||
              intentId < 1 ||
              !Number.isSafeInteger(organizationId) ||
              organizationId < 1
            ) {
              throw new Error("Escopo SLA inválido.");
            }

            const pointer = (
              await tx
                .select({ taskId: workflowSlaEventIntents.taskId })
                .from(workflowSlaEventIntents)
                .where(
                  and(
                    eq(workflowSlaEventIntents.id, intentId),
                    eq(workflowSlaEventIntents.organizationId, organizationId),
                  ),
                )
                .limit(1)
            )[0];
            if (!pointer) return null;

            const task = (
              await tx
                .select()
                .from(workflowTasks)
                .where(eq(workflowTasks.id, pointer.taskId))
                .limit(1)
                .for("update")
            )[0];
            if (!task) return null;

            const scope = (
              await tx
                .select({
                  organizationId: workflowExecutionTenantScopes.organizationId,
                })
                .from(workflowExecutionTenantScopes)
                .where(
                  and(
                    eq(workflowExecutionTenantScopes.executionId, task.executionId),
                    eq(workflowExecutionTenantScopes.organizationId, organizationId),
                  ),
                )
                .limit(1)
                .for("update")
            )[0];
            if (!scope || scope.organizationId !== organizationId) {
              throw new Error("Intenção SLA não encontrada no escopo autorizado.");
            }

            const execution = (
              await tx
                .select()
                .from(workflowInstanceExecutions)
                .where(eq(workflowInstanceExecutions.id, task.executionId))
                .limit(1)
                .for("update")
            )[0];

            const intent = (
              await tx
                .select()
                .from(workflowSlaEventIntents)
                .where(
                  and(
                    eq(workflowSlaEventIntents.id, intentId),
                    eq(workflowSlaEventIntents.organizationId, organizationId),
                  ),
                )
                .limit(1)
                .for("update")
            )[0];
            if (!intent) return null;

            if (
              !execution ||
              intent.taskId !== task.id ||
              task.id !== pointer.taskId ||
              intent.organizationId !== organizationId ||
              intent.workflowVersionId !== task.workflowVersionId ||
              execution.workflowVersionId !== task.workflowVersionId ||
              intent.nodeId !== task.nodeId ||
              !["open", "in_progress", "completed", "cancelled"].includes(task.status)
            ) {
              throw new Error("Intenção SLA diverge da tarefa/execução congelada.");
            }

            workflowVersionId = intent.workflowVersionId;
            nodeId = intent.nodeId;
            loaded = {
              state: hydrateWorkflowSlaIntent(intent),
              taskActive: task.status === "open" || task.status === "in_progress",
            };
            return loaded;
          },

          async commitReplay(change) {
            const { current, next } = change;
            assertWorkflowSlaDeliveryState(current);
            assertWorkflowSlaDeliveryState(next);

            if (
              !loaded ||
              (Object.keys(current) as (keyof typeof current)[]).some(
                key => current[key] !== loaded!.state[key],
              ) ||
              current.status !== "dead_letter" ||
              next.status !== "pending" ||
              next.version !== current.version + 1 ||
              next.attempts !== 0 ||
              next.intentId !== current.intentId ||
              next.organizationId !== current.organizationId ||
              next.taskId !== current.taskId ||
              next.eventKind !== current.eventKind ||
              next.scheduledAt !== current.scheduledAt ||
              next.correlationId !== current.correlationId ||
              next.leaseOwner !== null ||
              next.leaseToken !== null ||
              next.leaseExpiresAt !== null ||
              next.nextAttemptAt !== null ||
              next.deliveredAt !== null ||
              next.deadLetteredAt !== null
            ) {
              throw new Error("Replay SLA sem snapshot bloqueado correspondente.");
            }

            const [result] = await tx
              .update(workflowSlaEventIntents)
              .set({
                status: "pending",
                deliveryVersion: next.version,
                deliveryAttempts: 0,
                leaseOwner: null,
                leaseToken: null,
                leaseExpiresAtMs: null,
                nextAttemptAtMs: null,
                deliveredAtMs: null,
                deadLetteredAtMs: null,
                lastFailureCode: next.lastFailureCode,
              })
              .where(
                and(
                  eq(workflowSlaEventIntents.id, current.intentId),
                  eq(workflowSlaEventIntents.organizationId, current.organizationId),
                  eq(workflowSlaEventIntents.deliveryVersion, current.version),
                  eq(workflowSlaEventIntents.status, "dead_letter"),
                  eq(workflowSlaEventIntents.taskId, current.taskId),
                  eq(workflowSlaEventIntents.workflowVersionId, workflowVersionId),
                  eq(workflowSlaEventIntents.nodeId, nodeId),
                  eq(workflowSlaEventIntents.eventKind, current.eventKind),
                  eq(workflowSlaEventIntents.correlationId, current.correlationId),
                  eq(workflowSlaEventIntents.scheduledAt, new Date(current.scheduledAt)),
                ),
              );

            if (result.affectedRows !== 1) {
              throw new WorkflowSlaDeliveryConflictError();
            }

            await tx.insert(auditLogs).values({
              resourceType: "workflow_sla_intent",
              resourceId: current.intentId,
              action: "workflow_sla.admin_replay",
              actorUserId: change.actorUserId,
              beforeData: {
                organizationId: current.organizationId,
                taskId: current.taskId,
                status: current.status,
                deliveryVersion: current.version,
                attempts: current.attempts,
                lastFailureCode: current.lastFailureCode,
                deadLetteredAt: current.deadLetteredAt,
              },
              afterData: {
                organizationId: next.organizationId,
                taskId: next.taskId,
                workflowVersionId,
                nodeId,
                correlationId: next.correlationId,
                status: next.status,
                deliveryVersion: next.version,
                attempts: next.attempts,
                reason: change.reason,
                replayedAt: change.replayedAt,
                previousFailureCode: current.lastFailureCode,
                administrativeReplay: true,
              },
            });
          },
        });
      }),
  };
}
