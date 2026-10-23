import { and, desc, eq } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { integrationDeliveryOutbox } from "../drizzle/integrationDeliverySchema";
import type { getDb } from "./dbLegacy";

type IntegrationDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;

export type RecoveryAuditState = {
  deliveryId: number;
  organizationId: number;
  system: "neo" | "inventory" | "crm";
  status: "pending" | "leased" | "delivered" | "dead_letter";
  version: number;
  attempts: number;
  correlationId: string;
  lastFailureKind: string | null;
  deadLetteredAtMs: number | null;
};
export type RecoveryAuditEntry = {
  resourceId: number;
  actorUserId: number | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
};
export type RecoveryAuditVerificationStatus =
  | "verified" | "missing" | "inconsistent" | "not_applicable" | "not_found";
export type RecoveryAuditVerification = Readonly<{
  organizationId: number;
  deliveryId: number;
  status: RecoveryAuditVerificationStatus;
  /** Not a grant to retry, recover or communicate with an external service. */
  permitsReplay: false;
}>;

const beforeKeys = [
  "organizationId", "system", "correlationId", "status",
  "deliveryVersion", "attempts",
];
const afterKeys = [
  "organizationId", "system", "correlationId", "status",
  "deliveryVersion", "reasonCode", "ticketReference",
  "evaluatedAtEpochMs", "remoteOutcome",
];
const reasons = new Set([
  "delivery_outcome_unknown", "lease_expired_after_disconnect",
  "operator_reconciliation",
]);
const systems = new Set(["neo", "inventory", "crm"]);
const states = new Set(["pending", "leased", "delivered", "dead_letter"]);

function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function result(
  organizationId: number, deliveryId: number,
  status: RecoveryAuditVerificationStatus,
): RecoveryAuditVerification {
  return Object.freeze({ organizationId, deliveryId, status, permitsReplay: false });
}
function saneState(s: RecoveryAuditState): boolean {
  return validId(s.deliveryId) && validId(s.organizationId)
    && systems.has(s.system) && states.has(s.status)
    && Number.isSafeInteger(s.version) && s.version >= 0
    && Number.isSafeInteger(s.attempts) && s.attempts >= 0
    && typeof s.correlationId === "string"
    && /^[A-Za-z0-9._:-]{3,160}$/.test(s.correlationId);
}

/**
 * Classifies existing J20 audit evidence without copying raw database objects
 * or claiming that an external provider did/did not receive a message.
 * "missing" does NOT authorize replay; it may describe an earlier J17
 * administrative quarantine performed without J20's atomic audit path.
 */
export function classifyIntegrationRecoveryAudit(
  state: RecoveryAuditState,
  entries: readonly RecoveryAuditEntry[],
): RecoveryAuditVerification {
  if (!saneState(state) || !Array.isArray(entries)) {
    throw new Error("Estado de auditoria de integração inválido.");
  }
  if (state.status !== "dead_letter" || state.lastFailureKind !== "unknown") {
    return result(state.organizationId, state.deliveryId, "not_applicable");
  }
  if (!Number.isSafeInteger(state.deadLetteredAtMs)
    || state.deadLetteredAtMs === null || state.deadLetteredAtMs < 0) {
    return result(state.organizationId, state.deliveryId, "inconsistent");
  }
  if (entries.length === 0) return result(state.organizationId, state.deliveryId, "missing");
  if (entries.length !== 1) return result(state.organizationId, state.deliveryId, "inconsistent");
  const audit = entries[0];
  const b = audit.beforeData;
  const a = audit.afterData;
  const matches = validId(audit.actorUserId as number)
    && audit.resourceId === state.deliveryId
    && record(b) && record(a)
    && exactKeys(b, beforeKeys) && exactKeys(a, afterKeys)
    && b.organizationId === state.organizationId
    && a.organizationId === state.organizationId
    && b.system === state.system && a.system === state.system
    && b.correlationId === state.correlationId
    && a.correlationId === state.correlationId
    && b.status === "leased" && a.status === "dead_letter"
    && Number.isSafeInteger(b.deliveryVersion)
    && (b.deliveryVersion as number) + 1 === state.version
    && a.deliveryVersion === state.version
    && b.attempts === state.attempts
    && reasons.has(a.reasonCode as string)
    && typeof a.ticketReference === "string"
    && /^(?:INC|CHG|OPS)-[0-9]{3,12}$/.test(a.ticketReference)
    && a.evaluatedAtEpochMs === state.deadLetteredAtMs
    && a.remoteOutcome === "unknown";
  return result(state.organizationId, state.deliveryId,
    matches ? "verified" : "inconsistent");
}

/**
 * Internal read-only factory. No route, token, payload, worker, scheduler,
 * retry or administrative update is exposed. The active organization must
 * have been resolved from an authenticated server-side session.
 */
export function createIntegrationRecoveryAuditVerifier(db: IntegrationDb) {
  return {
    async verify(input: {
      organizationId: number;
      deliveryId: number;
    }): Promise<RecoveryAuditVerification> {
      if (process.env.NODE_ENV !== "test"
        || process.env.AXE_RUNTIME_ENV !== "homologation"
        || process.env.AXE_INTEGRATION_MYSQL_TESTS !== "true") {
        throw new Error("Diagnóstico J21 desabilitado fora de homologação.");
      }
      if (!validId(input.organizationId) || !validId(input.deliveryId)) {
        throw new Error("Escopo de auditoria inválido.");
      }
      const state = (await db.select({
        deliveryId: integrationDeliveryOutbox.id,
        organizationId: integrationDeliveryOutbox.organizationId,
        system: integrationDeliveryOutbox.system,
        status: integrationDeliveryOutbox.status,
        version: integrationDeliveryOutbox.deliveryVersion,
        attempts: integrationDeliveryOutbox.deliveryAttempts,
        correlationId: integrationDeliveryOutbox.correlationId,
        lastFailureKind: integrationDeliveryOutbox.lastFailureKind,
        deadLetteredAtMs: integrationDeliveryOutbox.deadLetteredAtMs,
      }).from(integrationDeliveryOutbox).where(and(
        eq(integrationDeliveryOutbox.id, input.deliveryId),
        eq(integrationDeliveryOutbox.organizationId, input.organizationId),
      )).limit(1))[0];
      if (!state) return result(input.organizationId, input.deliveryId, "not_found");
      if (state.status !== "dead_letter" || state.lastFailureKind !== "unknown") {
        return result(input.organizationId, input.deliveryId, "not_applicable");
      }
      const audits = await db.select({
        resourceId: auditLogs.resourceId,
        actorUserId: auditLogs.actorUserId,
        beforeData: auditLogs.beforeData,
        afterData: auditLogs.afterData,
      }).from(auditLogs).where(and(
        eq(auditLogs.resourceType, "integration_delivery_outbox"),
        eq(auditLogs.resourceId, input.deliveryId),
        eq(auditLogs.action, "integration.outbox.expired_lease.quarantine"),
      )).orderBy(desc(auditLogs.id)).limit(2);
      return classifyIntegrationRecoveryAudit(state, audits);
    },
  };
}
