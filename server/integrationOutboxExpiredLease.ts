import { and, eq, lte } from "drizzle-orm";
import { integrationDeliveryOutbox } from "../drizzle/integrationDeliverySchema";
import type { getDb } from "./dbLegacy";
import {
  assertIntegrationOutboxSnapshot,
  type IntegrationOutboxSnapshot,
} from "./integrationOutboxCas";

type IntegrationDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;
const MAX_EPOCH_MS = 8_640_000_000_000_000;

function assertTrustedClock(nowEpochMs: number): void {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0
    || nowEpochMs > MAX_EPOCH_MS) {
    throw new Error("Relógio inválido para recuperação de lease.");
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(label + " inválido.");
}

/**
 * Conservative administrative recovery: an expired lease is quarantined for
 * manual reconciliation, never automatically sent again. Since the provider
 * may have received the previous request, retrying would risk duplicates.
 *
 * This function is pure; it neither persists nor sends an external request.
 * Callers MUST resolve tenant authorization, privileged role, audit and a
 * trusted synchronized server clock before invoking the storage adapter.
 */
export function buildExpiredIntegrationLeaseQuarantine(
  current: IntegrationOutboxSnapshot,
  nowEpochMs: number,
): IntegrationOutboxSnapshot {
  assertIntegrationOutboxSnapshot(current);
  assertTrustedClock(nowEpochMs);
  if (current.status !== "leased") {
    throw new Error("Somente entrega leased/reservada pode ser recuperada.");
  }
  if (current.leaseExpiresAtMs === null || nowEpochMs < current.leaseExpiresAtMs) {
    throw new Error("Lease ainda não expirou; recuperação bloqueada.");
  }
  if (current.version >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Versão da entrega excede o limite permitido.");
  }
  const next: IntegrationOutboxSnapshot = {
    ...current,
    status: "dead_letter",
    version: current.version + 1,
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAtMs: null,
    nextAttemptAtMs: null,
    deliveredAtMs: null,
    deadLetteredAtMs: nowEpochMs,
    lastFailureKind: "unknown",
  };
  assertIntegrationOutboxSnapshot(next);
  return next;
}

/**
 * An intentionally unbound storage factory: no route, scheduler, permission
 * grant, transaction orchestration, or external integration is activated.
 * State changes are guarded by one versioned, tenant-scoped UPDATE.
 *
 * CAS with status/version/token/expiry means concurrent workers and recovery
 * cannot both commit a transition for the same persisted version.
 */
export function createExpiredIntegrationLeaseRecoveryStorage(db: IntegrationDb) {
  return {
    async quarantineExpired(input: {
      organizationId: number;
      deliveryId: number;
      expectedVersion: number;
      current: IntegrationOutboxSnapshot;
      nowEpochMs: number;
    }): Promise<boolean> {
      assertPositiveSafeInteger(input.organizationId, "Organização");
      assertPositiveSafeInteger(input.deliveryId, "Identificador da entrega");
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
        throw new Error("Versão CAS inválida.");
      }
      assertTrustedClock(input.nowEpochMs);
      if (input.current.organizationId !== input.organizationId
        || input.current.deliveryId !== input.deliveryId) {
        throw new Error("Escopo de recuperação incompatível com tenant ou entrega.");
      }
      if (input.current.version !== input.expectedVersion) {
        throw new Error("Versão CAS divergente/obsoleta para recuperação.");
      }
      const next = buildExpiredIntegrationLeaseQuarantine(input.current, input.nowEpochMs);
      const [result] = await db.update(integrationDeliveryOutbox).set({
        status: next.status,
        deliveryVersion: next.version,
        deliveryAttempts: next.attempts,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAtMs: null,
        nextAttemptAtMs: null,
        deliveredAtMs: null,
        deadLetteredAtMs: next.deadLetteredAtMs,
        lastFailureKind: next.lastFailureKind,
      }).where(and(
        eq(integrationDeliveryOutbox.organizationId, input.organizationId),
        eq(integrationDeliveryOutbox.id, input.deliveryId),
        eq(integrationDeliveryOutbox.deliveryVersion, input.expectedVersion),
        eq(integrationDeliveryOutbox.status, "leased"),
        eq(integrationDeliveryOutbox.leaseOwner, input.current.leaseOwner!),
        eq(integrationDeliveryOutbox.leaseToken, input.current.leaseToken!),
        eq(integrationDeliveryOutbox.leaseExpiresAtMs, input.current.leaseExpiresAtMs!),
        lte(integrationDeliveryOutbox.leaseExpiresAtMs, input.nowEpochMs),
        eq(integrationDeliveryOutbox.system, input.current.system),
        eq(integrationDeliveryOutbox.contractVersion, input.current.contractVersion),
        eq(integrationDeliveryOutbox.idempotencyKey, input.current.idempotencyKey),
        eq(integrationDeliveryOutbox.correlationId, input.current.correlationId),
      ));
      if (result.affectedRows === 0) return false;
      if (result.affectedRows !== 1) {
        throw new Error("Invariante CAS de recuperação violada: múltiplas linhas atualizadas.");
      }
      return true;
    },
  };
}
