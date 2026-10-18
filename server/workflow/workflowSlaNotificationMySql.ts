import { and, eq, gt } from "drizzle-orm";
import { auditLogs } from "../../drizzle/schema";
import { getDb } from "../dbLegacy";
import {
  createWorkflowSlaInternalNotificationService,
  matchesWorkflowSlaNotificationReceipt,
  validateWorkflowSlaNotificationInput,
  workflowSlaNotificationEventKey,
  type WorkflowSlaNotificationInput,
  type WorkflowSlaNotificationSnapshot,
  type WorkflowSlaNotificationStore,
} from "./workflowSlaInternalNotification";
import { hydrateWorkflowSlaIntent } from "./workflowSlaDeliveryMySql";
import { assertWorkflowSlaDeliveryState } from "./workflowSlaDeliveryState";
import { WorkflowSlaDeliveryConflictError } from "./workflowSlaDeliveryCoordinator";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import { workflowSlaNotifications } from "./workflowSlaNotificationSchema";
import { workflowTasks } from "./workflowTaskSchema";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";

// Accept a Drizzle database backed by either a pool or an independent connection.
type WorkflowDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;

function isoFromMillis(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > 253402300799999) {
    throw new Error("Timestamp do recibo SLA inválido.");
  }
  return new Date(value).toISOString();
}

/** No autostart. All writes use one connection/transaction and current locking reads. */
export function createWorkflowSlaNotificationMySqlStore(
  db: WorkflowDb
): WorkflowSlaNotificationStore {
  return {
    transaction: callback =>
      db.transaction(async tx => {
        let loaded: WorkflowSlaNotificationSnapshot | null = null;
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
            // Discover only the pointer, then reread intent under lock after its task.
            const pointer = (
              await tx
                .select({ taskId: workflowSlaEventIntents.taskId })
                .from(workflowSlaEventIntents)
                .where(
                  and(
                    eq(workflowSlaEventIntents.id, intentId),
                    eq(workflowSlaEventIntents.organizationId, organizationId)
                  )
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
                    eq(
                      workflowExecutionTenantScopes.executionId,
                      task.executionId
                    ),
                    eq(
                      workflowExecutionTenantScopes.organizationId,
                      organizationId
                    )
                  )
                )
                .limit(1)
                .for("update")
            )[0];
            if (!scope || scope.organizationId !== organizationId) {
              throw new Error(
                "Intenção SLA não encontrada no escopo autorizado."
              );
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
                    eq(workflowSlaEventIntents.organizationId, organizationId)
                  )
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
              // execution.correlationId changes on cancel/resume. The durable
              // intent owns the frozen SLA correlation used in receipt and audit.
              intent.nodeId !== task.nodeId ||
              !["open", "in_progress", "completed", "cancelled"].includes(
                task.status
              )
            ) {
              throw new Error(
                "Intenção SLA diverge da tarefa/execução congelada."
              );
            }
            loaded = {
              state: hydrateWorkflowSlaIntent(intent),
              workflowVersionId: intent.workflowVersionId,
              nodeId: intent.nodeId,
              taskActive:
                task.status === "open" || task.status === "in_progress",
            };
            return loaded;
          },
          async findReceipt({ organizationId, eventKey }) {
            // FOR UPDATE is essential under REPEATABLE READ: the pointer lookup may
            // predate another worker's commit. A snapshot read could miss its receipt.
            const row = (
              await tx
                .select()
                .from(workflowSlaNotifications)
                .where(
                  and(
                    eq(workflowSlaNotifications.organizationId, organizationId),
                    eq(workflowSlaNotifications.eventKey, eventKey)
                  )
                )
                .limit(1)
                .for("update")
            )[0];
            if (!row) return null;
            return {
              organizationId: row.organizationId,
              intentId: row.intentId,
              taskId: row.taskId,
              workflowVersionId: row.workflowVersionId,
              nodeId: row.nodeId,
              correlationId: row.correlationId,
              eventKind: row.eventKind,
              eventKey: row.eventKey,
              scheduledAt: isoFromMillis(row.scheduledAtMs),
              acceptedAt: isoFromMillis(row.acceptedAtMs),
              deliveryVersion: row.deliveryVersion,
            };
          },
          async commit(change) {
            const { current, next, receipt } = change;
            assertWorkflowSlaDeliveryState(current);
            assertWorkflowSlaDeliveryState(next);
            if (
              !loaded ||
              (Object.keys(current) as (keyof typeof current)[]).some(
                key => current[key] !== loaded!.state[key]
              ) ||
              next.version !== current.version + 1 ||
              current.status !== "leased" ||
              next.intentId !== current.intentId ||
              next.organizationId !== current.organizationId ||
              next.taskId !== current.taskId ||
              next.eventKind !== current.eventKind ||
              next.scheduledAt !== current.scheduledAt ||
              next.correlationId !== current.correlationId ||
              next.attempts !== current.attempts ||
              change.eventKey !== workflowSlaNotificationEventKey(current) ||
              change.workerId !== current.leaseOwner
            ) {
              throw new Error(
                "Confirmação SLA sem snapshot bloqueado correspondente."
              );
            }
            if (
              loaded.taskActive
                ? next.status !== "delivered" ||
                  change.reason !== "internal_accepted" ||
                  !receipt ||
                  !matchesWorkflowSlaNotificationReceipt(receipt, {
                    ...loaded,
                    state: next,
                  })
                : next.status !== "dead_letter" ||
                  change.reason !== "task_inactive" ||
                  receipt !== null ||
                  next.lastFailureCode !== "permanent_rejection"
            ) {
              throw new Error(
                "Confirmação SLA diverge do recibo/estado da tarefa."
              );
            }
            const acceptedAt = next.deliveredAt ?? next.deadLetteredAt!;
            const [result] = await tx
              .update(workflowSlaEventIntents)
              .set({
                status: next.status,
                deliveryVersion: next.version,
                leaseOwner: null,
                leaseToken: null,
                leaseExpiresAtMs: null,
                nextAttemptAtMs: null,
                deliveredAtMs:
                  next.deliveredAt === null
                    ? null
                    : Date.parse(next.deliveredAt),
                deadLetteredAtMs:
                  next.deadLetteredAt === null
                    ? null
                    : Date.parse(next.deadLetteredAt),
                lastFailureCode: next.lastFailureCode,
              })
              .where(
                and(
                  eq(workflowSlaEventIntents.id, current.intentId),
                  eq(
                    workflowSlaEventIntents.organizationId,
                    current.organizationId
                  ),
                  eq(workflowSlaEventIntents.deliveryVersion, current.version),
                  eq(workflowSlaEventIntents.status, "leased"),
                  eq(workflowSlaEventIntents.leaseOwner, current.leaseOwner!),
                  eq(workflowSlaEventIntents.leaseToken, current.leaseToken!),
                  gt(
                    workflowSlaEventIntents.leaseExpiresAtMs,
                    Date.parse(acceptedAt)
                  ),
                  eq(workflowSlaEventIntents.taskId, current.taskId),
                  eq(
                    workflowSlaEventIntents.workflowVersionId,
                    loaded.workflowVersionId
                  ),
                  eq(workflowSlaEventIntents.nodeId, loaded.nodeId),
                  eq(workflowSlaEventIntents.eventKind, current.eventKind),
                  eq(
                    workflowSlaEventIntents.correlationId,
                    current.correlationId
                  ),
                  eq(
                    workflowSlaEventIntents.scheduledAt,
                    new Date(current.scheduledAt)
                  )
                )
              );
            if (result.affectedRows !== 1)
              throw new WorkflowSlaDeliveryConflictError();
            if (receipt) {
              const { scheduledAt, acceptedAt, ...fields } = receipt;
              await tx.insert(workflowSlaNotifications).values({
                ...fields,
                scheduledAtMs: Date.parse(scheduledAt),
                acceptedAtMs: Date.parse(acceptedAt),
              });
            }
            // Explicit allowlist: never serialize current state (it contains a lease token).
            await tx.insert(auditLogs).values({
              resourceType: "workflow_sla_intent",
              resourceId: current.intentId,
              action: `workflow_sla.${change.reason}`,
              actorUserId: null,
              beforeData: {
                status: current.status,
                deliveryVersion: current.version,
              },
              afterData: {
                organizationId: next.organizationId,
                taskId: next.taskId,
                workflowVersionId: loaded.workflowVersionId,
                nodeId: loaded.nodeId,
                correlationId: next.correlationId,
                eventKey: change.eventKey,
                status: next.status,
                deliveryVersion: next.version,
                workerId: change.workerId,
                occurredAt: acceptedAt,
                internalOnly: true,
              },
            });
          },
        });
      }),
  };
}

/** Caller must authenticate/authorize the organization's administrator before invoking. */
export async function confirmWorkflowSlaI5dHomologation(
  input: WorkflowSlaNotificationInput
) {
  validateWorkflowSlaNotificationInput(input);
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para homologação I5D.");
  return createWorkflowSlaInternalNotificationService(
    createWorkflowSlaNotificationMySqlStore(db)
  ).confirm(input);
}
