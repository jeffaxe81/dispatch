import { and, eq } from "drizzle-orm";
import { getDb } from "../dbLegacy";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import type { WorkflowSlaDeliveryStorage } from "./workflowSlaDeliveryCoordinator";
import {
  assertWorkflowSlaDeliveryState,
  type WorkflowSlaDeliveryState,
} from "./workflowSlaDeliveryState";

type WorkflowDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type IntentRow = typeof workflowSlaEventIntents.$inferSelect;

/** Convert UTC milliseconds into an ISO instant without relying on SQL session timezone. */
function millisToIso(value: number | null, label: string): string | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) {
    throw new Error(`Timestamp SLA persistido inválido: ${label}.`);
  }
  return new Date(value).toISOString();
}

function isoToMillis(value: string | null): number | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Data de SLA inválida.");
  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0
    || new Date(timestamp).toISOString() !== value) {
    throw new Error("Data SLA deve representar UTC válido com milissegundos.");
  }
  return timestamp;
}

/** Hydration is fail-closed; inconsistent persisted states are never repaired silently. */
export function hydrateWorkflowSlaIntent(row: IntentRow): WorkflowSlaDeliveryState {
  if (!(row.scheduledAt instanceof Date) || !Number.isFinite(row.scheduledAt.getTime())) {
    throw new Error("Prazo original da intenção SLA inválido.");
  }
  const expectedEventType = {
    reminder: "workflow.task.sla.reminder.v1",
    overdue: "workflow.task.sla.overdue.v1",
    escalation: "workflow.task.escalation.requested.v1",
  }[row.eventKind];
  if (!expectedEventType || row.eventType !== expectedEventType
    || !Number.isSafeInteger(row.workflowVersionId) || row.workflowVersionId < 1
    || typeof row.nodeId !== "string" || !row.nodeId.trim()) {
    throw new Error("Metadados congelados da intenção SLA inválidos.");
  }
  const state: WorkflowSlaDeliveryState = {
    intentId: row.id,
    taskId: row.taskId,
    organizationId: row.organizationId,
    eventKind: row.eventKind,
    scheduledAt: row.scheduledAt.toISOString(),
    correlationId: row.correlationId,
    status: row.status,
    version: row.deliveryVersion,
    attempts: row.deliveryAttempts,
    leaseOwner: row.leaseOwner,
    leaseToken: row.leaseToken,
    leaseExpiresAt: millisToIso(row.leaseExpiresAtMs, "lease_expires_at_ms"),
    nextAttemptAt: millisToIso(row.nextAttemptAtMs, "next_attempt_at_ms"),
    deliveredAt: millisToIso(row.deliveredAtMs, "delivered_at_ms"),
    deadLetteredAt: millisToIso(row.deadLetteredAtMs, "dead_lettered_at_ms"),
    lastFailureCode: row.lastFailureCode,
  };
  assertWorkflowSlaDeliveryState(state);
  return state;
}

/**
 * I5B storage: optimistic CAS enforced by a single UPDATE.
 * Every WHERE includes (intentId, organizationId, expectedVersion).
 * No transaction can confirm an obsolete worker lease after another one commits.
 * The application must authenticate/authorize tenantId before calling this adapter.
 *
 * This adapter does NOT send notifications, claim work automatically or mutate
 * incident status. The migration must be applied independently in homologation.
 */
export function createWorkflowSlaMySqlDeliveryStorage(
  db: WorkflowDb,
): WorkflowSlaDeliveryStorage {
  return {
    async loadByTenant({ intentId, organizationId }) {
      if (!Number.isSafeInteger(intentId) || intentId < 1
        || !Number.isSafeInteger(organizationId) || organizationId < 1) {
        throw new Error("Escopo ou identificador de intenção inválido.");
      }
      const row = (
        await db.select().from(workflowSlaEventIntents)
          .where(and(
            eq(workflowSlaEventIntents.id, intentId),
            eq(workflowSlaEventIntents.organizationId, organizationId),
          )).limit(1)
      )[0];
      return row ? hydrateWorkflowSlaIntent(row) : null;
    },

    async compareAndSwap({ intentId, organizationId, expectedVersion, next }) {
      if (!Number.isSafeInteger(intentId) || intentId < 1
        || !Number.isSafeInteger(organizationId) || organizationId < 1
        || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new Error("Parâmetros CAS de intenção SLA inválidos.");
      }
      assertWorkflowSlaDeliveryState(next);
      if (next.intentId !== intentId || next.organizationId !== organizationId
        || next.version !== expectedVersion + 1) {
        throw new Error("Transição SLA não respeita escopo ou sequência CAS.");
      }

      const [result] = await db.update(workflowSlaEventIntents).set({
        status: next.status,
        deliveryVersion: next.version,
        deliveryAttempts: next.attempts,
        leaseOwner: next.leaseOwner,
        leaseToken: next.leaseToken,
        leaseExpiresAtMs: isoToMillis(next.leaseExpiresAt),
        nextAttemptAtMs: isoToMillis(next.nextAttemptAt),
        deliveredAtMs: isoToMillis(next.deliveredAt),
        deadLetteredAtMs: isoToMillis(next.deadLetteredAt),
        lastFailureCode: next.lastFailureCode,
      }).where(and(
        eq(workflowSlaEventIntents.id, intentId),
        eq(workflowSlaEventIntents.organizationId, organizationId),
        eq(workflowSlaEventIntents.deliveryVersion, expectedVersion),
        // Immutable intent metadata are also guarded.
        eq(workflowSlaEventIntents.taskId, next.taskId),
        eq(workflowSlaEventIntents.eventKind, next.eventKind),
        eq(workflowSlaEventIntents.correlationId, next.correlationId),
        eq(workflowSlaEventIntents.scheduledAt, new Date(next.scheduledAt)),
      ));

      if (result.affectedRows === 0) return false;
      if (result.affectedRows !== 1) {
        throw new Error("Invariante CAS SLA violada: número de linhas atualizado inesperado.");
      }
      return true;
    },
  };
}
