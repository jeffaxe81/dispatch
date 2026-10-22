import { and, eq, isNull } from "drizzle-orm";
import { integrationDeliveryOutbox } from "../drizzle/integrationDeliverySchema";
import { assertIntegrationContractCompatibility, type IntegrationMode, type IntegrationSystem } from "../shared/integrationContracts";
import type { getDb } from "./dbLegacy";

type IntegrationDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;
type IntegrationRow = typeof integrationDeliveryOutbox.$inferSelect;

export type IntegrationOutboxFailureKind =
  | "timeout" | "unavailable" | "rate_limited"
  | "contract_mismatch" | "authorization" | "unknown";

export type IntegrationOutboxSnapshot = {
  deliveryId: number;
  organizationId: number;
  system: IntegrationSystem;
  contractVersion: 1;
  mode: IntegrationMode;
  operation: string;
  messageId: string;
  idempotencyKey: string;
  correlationId: string;
  status: "pending" | "leased" | "delivered" | "dead_letter";
  version: number;
  attempts: number;
  maxAttempts: number;
  failureThreshold: number;
  cooldownSeconds: number;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAtMs: number | null;
  nextAttemptAtMs: number | null;
  deliveredAtMs: number | null;
  deadLetteredAtMs: number | null;
  payloadReference: string | null;
  lastFailureKind: IntegrationOutboxFailureKind | null;
};

const failureKinds = new Set<string>([
  "timeout", "unavailable", "rate_limited",
  "contract_mismatch", "authorization", "unknown",
]);
const states = new Set<string>(["pending", "leased", "delivered", "dead_letter"]);
const maximumEpochMs = 8_640_000_000_000_000;

function assertInteger(value: number, label: string, min = 1): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(label + " inválido.");
  }
}

function assertEpoch(value: number | null, label: string): void {
  if (value !== null && (!Number.isSafeInteger(value)
    || value < 0 || value > maximumEpochMs)) {
    throw new Error("Timestamp de " + label + " inválido.");
  }
}

function requiredText(value: string, label: string, maxLength: number): void {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(label + " inválido.");
  }
}

function validateIntegrationOutboxSnapshot(state: IntegrationOutboxSnapshot): void {
  assertInteger(state.deliveryId, "ID da entrega");
  assertInteger(state.organizationId, "Organização");
  assertIntegrationContractCompatibility({
    system: state.system, requestedVersion: state.contractVersion,
  });
  if (state.mode !== "api" && state.mode !== "event") {
    throw new Error("Modo da integração inválido.");
  }
  requiredText(state.operation, "Operação", 160);
  requiredText(state.messageId, "Message ID", 160);
  requiredText(state.idempotencyKey, "Chave idempotente", 255);
  requiredText(state.correlationId, "Correlation ID", 160);
  if (state.payloadReference !== null) {
    requiredText(state.payloadReference, "Referência de payload", 512);
  }
  assertInteger(state.version, "Versão", 0);
  assertInteger(state.attempts, "Tentativas", 0);
  assertInteger(state.maxAttempts, "Máximo de tentativas");
  assertInteger(state.failureThreshold, "Limiar de falhas");
  assertInteger(state.cooldownSeconds, "Cooldown");
  if (state.attempts > state.maxAttempts) {
    throw new Error("Tentativas excedem o limite configurado.");
  }
  for (const [name, value] of [
    ["expiração de lease", state.leaseExpiresAtMs],
    ["próxima tentativa", state.nextAttemptAtMs],
    ["entrega", state.deliveredAtMs],
    ["dead-letter", state.deadLetteredAtMs],
  ] as const) assertEpoch(value, name);

  if (!states.has(state.status)) {
    throw new Error("Estado de entrega de integração inválido.");
  }
  if (state.lastFailureKind !== null && !failureKinds.has(state.lastFailureKind)) {
    throw new Error("Categoria de falha inválida.");
  }
  const hasLease = state.leaseOwner !== null
    || state.leaseToken !== null || state.leaseExpiresAtMs !== null;
  if (state.status === "leased") {
    requiredText(state.leaseOwner as string, "Lease owner", 120);
    requiredText(state.leaseToken as string, "Lease token", 160);
    if (state.leaseExpiresAtMs === null || state.leaseExpiresAtMs <= 0) {
      throw new Error("Lease incompleto para entrega reservada.");
    }
    if (state.attempts < 1 || state.nextAttemptAtMs !== null
      || state.deliveredAtMs !== null || state.deadLetteredAtMs !== null) {
      throw new Error("Lease com estado contraditório.");
    }
    return;
  }
  if (hasLease) throw new Error("Lease residual em entrega não reservada.");
  if (state.status === "pending") {
    if (state.deliveredAtMs !== null || state.deadLetteredAtMs !== null) {
      throw new Error("Estado pending contraditório.");
    }
  } else if (state.status === "delivered") {
    if (state.deliveredAtMs === null || state.deadLetteredAtMs !== null
      || state.nextAttemptAtMs !== null || state.attempts < 1) {
      throw new Error("Estado delivered inconsistente.");
    }
  } else if (state.deadLetteredAtMs === null || state.deliveredAtMs !== null
    || state.nextAttemptAtMs !== null || state.attempts < 1) {
    throw new Error("Estado dead_letter inconsistente.");
  }
}

export function hydrateIntegrationOutbox(row: IntegrationRow): IntegrationOutboxSnapshot {
  const snapshot: IntegrationOutboxSnapshot = {
    deliveryId: row.id,
    organizationId: row.organizationId,
    system: row.system,
    contractVersion: row.contractVersion as 1,
    mode: row.mode,
    operation: row.operation,
    messageId: row.messageId,
    idempotencyKey: row.idempotencyKey,
    correlationId: row.correlationId,
    status: row.status,
    version: row.deliveryVersion,
    attempts: row.deliveryAttempts,
    maxAttempts: row.maxAttempts,
    failureThreshold: row.failureThreshold,
    cooldownSeconds: row.cooldownSeconds,
    leaseOwner: row.leaseOwner,
    leaseToken: row.leaseToken,
    leaseExpiresAtMs: row.leaseExpiresAtMs,
    nextAttemptAtMs: row.nextAttemptAtMs,
    deliveredAtMs: row.deliveredAtMs,
    deadLetteredAtMs: row.deadLetteredAtMs,
    payloadReference: row.payloadReference,
    lastFailureKind: row.lastFailureKind,
  };
  validateIntegrationOutboxSnapshot(snapshot);
  return snapshot;
}

/**
 * Pure claim planner. A caller must persist its result using the tenant-scoped
 * CAS storage before treating the lease as acquired. No automatic scheduler.
 */
export function buildIntegrationOutboxClaim(
  current: IntegrationOutboxSnapshot,
  input: {
    nowEpochMs: number;
    workerId: string;
    leaseToken: string;
    leaseDurationMs: number;
  },
): IntegrationOutboxSnapshot {
  validateIntegrationOutboxSnapshot(current);
  assertEpoch(input.nowEpochMs, "relógio");
  if (input.nowEpochMs === null) throw new Error("Relógio inválido.");
  assertInteger(input.leaseDurationMs, "Duração de lease");
  requiredText(input.workerId, "Lease owner", 120);
  requiredText(input.leaseToken, "Lease token", 160);
  if (current.status !== "pending") throw new Error("Somente entrega pending pode ser reservada.");
  if (current.attempts >= current.maxAttempts) {
    throw new Error("Limite de tentativas esgotado.");
  }
  if (current.nextAttemptAtMs !== null && current.nextAttemptAtMs > input.nowEpochMs) {
    throw new Error("Entrega agendada ainda não elegível.");
  }
  const leaseExpiresAtMs = input.nowEpochMs + input.leaseDurationMs;
  assertEpoch(leaseExpiresAtMs, "expiração de lease");
  const next: IntegrationOutboxSnapshot = {
    ...current, status: "leased", version: current.version + 1,
    attempts: current.attempts + 1, leaseOwner: input.workerId,
    leaseToken: input.leaseToken, leaseExpiresAtMs, nextAttemptAtMs: null,
  };
  validateIntegrationOutboxSnapshot(next);
  return next;
}

type ResolutionInput = {
  nowEpochMs: number;
  leaseToken: string;
} & (
  | { outcome: "delivered"; failureKind?: never; nextAttemptAtMs?: never }
  | { outcome: "retry"; failureKind: IntegrationOutboxFailureKind; nextAttemptAtMs: number }
  | { outcome: "dead_letter"; failureKind: IntegrationOutboxFailureKind; nextAttemptAtMs?: never }
);

/**
 * A stale or expired worker cannot produce a valid completion, retry or DLQ
 * transition. Durable CAS checks the old token again at the database boundary.
 */
export function buildIntegrationOutboxResolution(
  current: IntegrationOutboxSnapshot,
  input: ResolutionInput,
): IntegrationOutboxSnapshot {
  validateIntegrationOutboxSnapshot(current);
  assertEpoch(input.nowEpochMs, "relógio");
  if (current.status !== "leased") throw new Error("Somente lease ativo pode ser resolvido.");
  requiredText(input.leaseToken, "Lease token", 160);
  if (input.leaseToken !== current.leaseToken) {
    throw new Error("Token de fencing não corresponde ao lease ativo.");
  }
  if (current.leaseExpiresAtMs === null
    || input.nowEpochMs >= current.leaseExpiresAtMs) {
    throw new Error("Lease expirado: worker não pode concluir entrega.");
  }
  const common = {
    ...current,
    version: current.version + 1,
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAtMs: null,
  };
  let next: IntegrationOutboxSnapshot;
  if (input.outcome === "delivered") {
    next = {
      ...common, status: "delivered", deliveredAtMs: input.nowEpochMs,
      nextAttemptAtMs: null, lastFailureKind: null,
    };
  } else {
    if (!failureKinds.has(input.failureKind)) {
      throw new Error("Categoria de falha inválida.");
    }
    if (input.outcome === "retry") {
      if (current.attempts >= current.maxAttempts) {
        throw new Error("Limite de tentativas esgotado: retry proibido.");
      }
      assertEpoch(input.nextAttemptAtMs, "próxima tentativa");
      if (input.nextAttemptAtMs <= input.nowEpochMs) {
        throw new Error("Próxima tentativa deve ocorrer no futuro.");
      }
      next = {
        ...common, status: "pending", nextAttemptAtMs: input.nextAttemptAtMs,
        lastFailureKind: input.failureKind,
      };
    } else if (input.outcome === "dead_letter") {
      next = {
        ...common, status: "dead_letter", deadLetteredAtMs: input.nowEpochMs,
        nextAttemptAtMs: null, lastFailureKind: input.failureKind,
      };
    } else {
      throw new Error("Resultado de entrega inválido.");
    }
  }
  validateIntegrationOutboxSnapshot(next);
  return next;
}

const immutableKeys = [
  "deliveryId", "organizationId", "system", "contractVersion", "mode",
  "operation", "messageId", "idempotencyKey", "correlationId",
  "maxAttempts", "failureThreshold", "cooldownSeconds", "payloadReference",
] as const;

function assertAllowedCasTransition(
  current: IntegrationOutboxSnapshot,
  next: IntegrationOutboxSnapshot,
  expectedVersion: number,
): void {
  validateIntegrationOutboxSnapshot(current);
  validateIntegrationOutboxSnapshot(next);
  if (current.version !== expectedVersion || next.version !== expectedVersion + 1) {
    throw new Error("Versão CAS obsoleta ou sequência de versão inválida.");
  }
  if (immutableKeys.some(key => current[key] !== next[key])) {
    throw new Error("Metadados imutáveis de integração divergentes.");
  }
  if (current.status === "pending") {
    if (next.status !== "leased" || next.attempts !== current.attempts + 1
      || current.attempts >= current.maxAttempts) {
      throw new Error("Transição pending requer claim válido.");
    }
  } else if (current.status === "leased") {
    if (!["pending", "delivered", "dead_letter"].includes(next.status)
      || next.attempts !== current.attempts) {
      throw new Error("Transição de lease não permitida.");
    }
  } else {
    throw new Error("Entrega terminal não permite transição automática ou replay.");
  }
}

/** Storage is only usable after explicit migration, scope authorization and
 * feature enablement. It neither connects to external systems nor runs workers.
 */
export function createIntegrationOutboxMySqlStorage(db: IntegrationDb) {
  return {
    async loadByTenant(input: { deliveryId: number; organizationId: number }): Promise<IntegrationOutboxSnapshot | null> {
      assertInteger(input.deliveryId, "ID da entrega");
      assertInteger(input.organizationId, "Organização");
      const row = (await db.select().from(integrationDeliveryOutbox)
        .where(and(
          eq(integrationDeliveryOutbox.id, input.deliveryId),
          eq(integrationDeliveryOutbox.organizationId, input.organizationId),
        )).limit(1))[0];
      return row ? hydrateIntegrationOutbox(row) : null;
    },

    async compareAndSwap(input: {
      organizationId: number;
      deliveryId: number;
      expectedVersion: number;
      current: IntegrationOutboxSnapshot;
      next: IntegrationOutboxSnapshot;
    }): Promise<boolean> {
      assertInteger(input.organizationId, "Organização");
      assertInteger(input.deliveryId, "ID da entrega");
      assertInteger(input.expectedVersion, "Versão", 0);
      if (input.current.organizationId !== input.organizationId
        || input.next.organizationId !== input.organizationId
        || input.current.deliveryId !== input.deliveryId
        || input.next.deliveryId !== input.deliveryId) {
        throw new Error("Escopo de integração não corresponde à organização/entrega.");
      }
      assertAllowedCasTransition(input.current, input.next, input.expectedVersion);
      const current = input.current;
      const next = input.next;
      const leaseCondition = current.leaseToken === null
        ? isNull(integrationDeliveryOutbox.leaseToken)
        : eq(integrationDeliveryOutbox.leaseToken, current.leaseToken);
      const [result] = await db.update(integrationDeliveryOutbox).set({
        status: next.status,
        deliveryVersion: next.version,
        deliveryAttempts: next.attempts,
        leaseOwner: next.leaseOwner,
        leaseToken: next.leaseToken,
        leaseExpiresAtMs: next.leaseExpiresAtMs,
        nextAttemptAtMs: next.nextAttemptAtMs,
        deliveredAtMs: next.deliveredAtMs,
        deadLetteredAtMs: next.deadLetteredAtMs,
        lastFailureKind: next.lastFailureKind,
      }).where(and(
        eq(integrationDeliveryOutbox.id, input.deliveryId),
        eq(integrationDeliveryOutbox.organizationId, input.organizationId),
        eq(integrationDeliveryOutbox.deliveryVersion, input.expectedVersion),
        eq(integrationDeliveryOutbox.status, current.status),
        leaseCondition,
        eq(integrationDeliveryOutbox.system, current.system),
        eq(integrationDeliveryOutbox.contractVersion, current.contractVersion),
        eq(integrationDeliveryOutbox.idempotencyKey, current.idempotencyKey),
        eq(integrationDeliveryOutbox.correlationId, current.correlationId),
      ));
      if (result.affectedRows === 0) return false;
      if (result.affectedRows !== 1) {
        throw new Error("Invariante CAS da integração violada: UPDATE alterou múltiplas linhas.");
      }
      return true;
    },
  };
}
