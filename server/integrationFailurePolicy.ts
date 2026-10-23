import type {
  IntegrationOutboxFailureKind,
  IntegrationOutboxSnapshot,
} from "./integrationOutboxCas";
import { assertIntegrationOutboxSnapshot } from "./integrationOutboxCas";

/**
 * J25 is a pure, non-executable reconciliation contract between J13 policies
 * and the J16/J23 persisted outbox. It never authorizes transport or replay.
 * The caller must load every snapshot and provider outcome from trusted
 * tenant-scoped infrastructure; browser input is not evidence.
 */
export type IntegrationFailureCertainty =
  | "confirmed_not_accepted"
  | "outcome_unknown";
export type IntegrationCircuitObservation = Readonly<{
  state: "closed" | "open" | "half_open";
  /** A trusted, persisted circuit observation, never a browser argument. */
  openedAtEpochMs: number | null;
}>;
export type IntegrationFailureResolution = Readonly<{
  organizationId: number;
  deliveryId: number;
  system: IntegrationOutboxSnapshot["system"];
  expectedVersion: number;
  kind: IntegrationOutboxFailureKind;
  disposition: "schedule_retry" | "quarantine";
  reason:
    | "confirmed_rejection"
    | "outcome_uncertain"
    | "permanent_or_unclassified"
    | "attempt_budget_exhausted"
    | "circuit_not_closed"
    | "failure_threshold_exceeded";
  /** For passing to J23.resolve; still requires live lease/token, CAS and audit. */
  transition: Readonly<
    | { outcome: "retry"; failureKind: IntegrationOutboxFailureKind; nextAttemptAtMs: number }
    | { outcome: "dead_letter"; failureKind: IntegrationOutboxFailureKind }
  >;
  permitsExternalCall: false;
  permitsProbe: false;
  permitsAutomaticReplay: false;
  requiresTenantScopedCas: true;
  requiresSeparateCircuitLease: true;
  coreDisposition: "continue";
}>;

const failureKinds = new Set<IntegrationOutboxFailureKind>([
  "timeout", "unavailable", "rate_limited",
  "contract_mismatch", "authorization", "unknown",
]);
const MAX_EPOCH_MS = 8_640_000_000_000_000;
const MAX_DELAY_MS = 60_000;
const RATE_LIMIT_FLOOR_MS = 30_000;
function positive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(name + " inválido.");
  }
}
function validClock(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_EPOCH_MS) {
    throw new Error(name + " inválido.");
  }
}
function checkedCircuit(
  circuit: IntegrationCircuitObservation,
  nowEpochMs: number,
): void {
  if (!circuit || !["closed", "open", "half_open"].includes(circuit.state)) {
    throw new Error("Estado de circuito inválido.");
  }
  if (circuit.state === "closed") {
    if (circuit.openedAtEpochMs !== null) {
      throw new Error("Circuito fechado não pode ter abertura pendente.");
    }
    return;
  }
  if (circuit.openedAtEpochMs === null) {
    throw new Error("Circuito aberto/half-open exige timestamp persistido.");
  }
  validClock(circuit.openedAtEpochMs, "Abertura do circuito");
  if (circuit.openedAtEpochMs > nowEpochMs) {
    throw new Error("Abertura do circuito está no futuro.");
  }
}
function result(
  current: IntegrationOutboxSnapshot,
  kind: IntegrationOutboxFailureKind,
  disposition: IntegrationFailureResolution["disposition"],
  reason: IntegrationFailureResolution["reason"],
  transition: IntegrationFailureResolution["transition"],
): IntegrationFailureResolution {
  return Object.freeze({
    organizationId: current.organizationId,
    deliveryId: current.deliveryId,
    system: current.system,
    expectedVersion: current.version,
    kind,
    disposition,
    reason,
    transition: Object.freeze(transition),
    permitsExternalCall: false,
    permitsProbe: false,
    permitsAutomaticReplay: false,
    requiresTenantScopedCas: true,
    requiresSeparateCircuitLease: true,
    coreDisposition: "continue",
  });
}

/**
 * Schedules ONLY a future persisted retry decision, never a network attempt.
 * An unknown/ambiguous remote outcome is always quarantined to prevent
 * duplicate deliveries. A closed circuit alone is also never a transport
 * grant: a future worker requires its own authorized persisted circuit lease.
 */
export function planIntegrationFailureResolution(input: {
  organizationId: number;
  current: IntegrationOutboxSnapshot;
  expectedVersion: number;
  nowEpochMs: number;
  failureKind: IntegrationOutboxFailureKind;
  remoteAcceptance: IntegrationFailureCertainty;
  circuit: IntegrationCircuitObservation;
  /** From trusted persisted circuit state, not inferred from attempts. */
  consecutiveFailures: number;
  /** Explicit tenant/adapter policy; no static J13 default is overlaid. */
  baseDelayMs: number;
}): IntegrationFailureResolution {
  positive(input.organizationId, "Organização");
  assertIntegrationOutboxSnapshot(input.current);
  positive(input.current.deliveryId, "Entrega");
  if (input.organizationId !== input.current.organizationId) {
    throw new Error("Tenant divergente na classificação de falhas.");
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1
    || input.current.version !== input.expectedVersion) {
    throw new Error("Versão CAS divergente na classificação de falhas.");
  }
  validClock(input.nowEpochMs, "Relógio de homologação");
  if (input.current.status !== "leased") {
    throw new Error("Apenas lease ativo pode ter resultado de falha.");
  }
  if (input.current.leaseExpiresAtMs === null
    || input.nowEpochMs >= input.current.leaseExpiresAtMs) {
    throw new Error("Lease expirado; usar reconciliação/quarentena J20.");
  }
  if (!failureKinds.has(input.failureKind)) {
    throw new Error("Categoria de falha não homologada.");
  }
  if (input.remoteAcceptance !== "confirmed_not_accepted"
    && input.remoteAcceptance !== "outcome_unknown") {
    throw new Error("Evidência de não aceitação inválida.");
  }
  if (!Number.isSafeInteger(input.consecutiveFailures)
    || input.consecutiveFailures < 1) {
    throw new Error("Falhas consecutivas inválidas.");
  }
  positive(input.baseDelayMs, "Backoff base");
  if (input.baseDelayMs > MAX_DELAY_MS) {
    throw new Error("Backoff base excede limite de homologação.");
  }
  checkedCircuit(input.circuit, input.nowEpochMs);

  const quarantine = (
    reason: IntegrationFailureResolution["reason"],
    kind: IntegrationOutboxFailureKind = input.failureKind,
  ) => result(input.current, kind, "quarantine", reason, {
    outcome: "dead_letter", failureKind: kind,
  });

  // A timed-out request may already have been performed by the provider.
  // No retry unless a trusted, explicit "not accepted" receipt exists.
  if (input.remoteAcceptance === "outcome_unknown") {
    return quarantine("outcome_uncertain", "unknown");
  }
  if (["contract_mismatch", "authorization", "unknown"].includes(input.failureKind)) {
    return quarantine("permanent_or_unclassified");
  }
  if (input.current.attempts >= input.current.maxAttempts) {
    return quarantine("attempt_budget_exhausted");
  }
  // J25 does NOT persist a circuit semaphore. Therefore open/half-open must
  // never be turned into a scheduled claim before a distinct fenced owner
  // and durable recovery gate are implemented.
  if (input.circuit.state !== "closed") {
    return quarantine("circuit_not_closed");
  }
  if (input.consecutiveFailures >= input.current.failureThreshold) {
    return quarantine("failure_threshold_exceeded");
  }

  // Bounded exponential schedule, capped before multiplying so large counts
  // cannot overflow. Even "rate_limited" requires definitive non-acceptance.
  const exponent = Math.min(input.consecutiveFailures - 1, 16);
  const backoffMs = Math.min(MAX_DELAY_MS, input.baseDelayMs * (2 ** exponent));
  const delayMs = input.failureKind === "rate_limited"
    ? Math.max(RATE_LIMIT_FLOOR_MS, backoffMs)
    : backoffMs;
  const nextAttemptAtMs = input.nowEpochMs + delayMs;
  validClock(nextAttemptAtMs, "Próxima tentativa");
  return result(input.current, input.failureKind, "schedule_retry",
    "confirmed_rejection", {
      outcome: "retry",
      failureKind: input.failureKind,
      nextAttemptAtMs,
    });
}
