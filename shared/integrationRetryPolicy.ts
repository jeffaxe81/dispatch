import { assertIntegrationContractCompatibility, type IntegrationSystem } from "./integrationContracts";

/**
 * J13: pure decisions only. No database, HTTP, timers, external writes or
 * automatic probes. The caller must persist state with tenant/system scoping,
 * CAS/fencing, authorization and an auditable receipt before executing actions.
 */
export type IntegrationFailureKind = "timeout" | "unavailable" | "rate_limited" | "permanent";
export type IntegrationRetryAction = "retry" | "open_circuit" | "quarantine";
export type IntegrationCircuitDecision = "allow" | "block" | "probe_required";
export type IntegrationCircuitState = "closed" | "open" | "half_open";

type AdapterPolicy = Readonly<{
  maxAttempts: number;
  openAfterFailures: number;
  baseDelayMs: number;
  cooldownMs: number;
}>;

/** Conservative pre-production defaults; tuning requires an explicit gate. */
export const INTEGRATION_ADAPTER_POLICIES: Readonly<Record<IntegrationSystem, AdapterPolicy>> = Object.freeze({
  neo: Object.freeze({ maxAttempts: 5, openAfterFailures: 3, baseDelayMs: 1_000, cooldownMs: 60_000 }),
  inventory: Object.freeze({ maxAttempts: 5, openAfterFailures: 4, baseDelayMs: 2_000, cooldownMs: 120_000 }),
  crm: Object.freeze({ maxAttempts: 6, openAfterFailures: 4, baseDelayMs: 1_500, cooldownMs: 90_000 }),
});

function assertTenant(tenantId: number): void {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
    throw new Error("Tenant inválido para política de integração.");
  }
}

function assertTime(nowEpochMs: number): void {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0 ||
      nowEpochMs > Number.MAX_SAFE_INTEGER - 120_000) {
    throw new Error("Tempo inválido para política de integração.");
  }
}

function policyFor(input: {
  tenantId: number;
  system: IntegrationSystem;
  contractVersion: number;
  nowEpochMs: number;
}): AdapterPolicy {
  assertTenant(input.tenantId);
  assertTime(input.nowEpochMs);
  const contract = assertIntegrationContractCompatibility({
    system: input.system, requestedVersion: input.contractVersion,
  });
  return INTEGRATION_ADAPTER_POLICIES[contract.system];
}

export function planIntegrationRetry(input: {
  tenantId: number;
  system: IntegrationSystem;
  contractVersion: number;
  failure: IntegrationFailureKind;
  consecutiveFailures: number;
  nowEpochMs: number;
}): {
  tenantId: number;
  system: IntegrationSystem;
  contractVersion: 1;
  action: IntegrationRetryAction;
  nextEligibleAtEpochMs: number | null;
  coreDisposition: "continue";
} {
  const policy = policyFor(input);
  if (!Number.isSafeInteger(input.consecutiveFailures) || input.consecutiveFailures < 1) {
    throw new Error("Número de tentativas inválido.");
  }
  if (!["timeout", "unavailable", "rate_limited", "permanent"].includes(input.failure)) {
    throw new Error("Classe de falha de integração inválida.");
  }

  let action: IntegrationRetryAction;
  let nextEligibleAtEpochMs: number | null = null;
  if (input.failure === "permanent" || input.consecutiveFailures >= policy.maxAttempts) {
    action = "quarantine";
  } else if (input.consecutiveFailures >= policy.openAfterFailures) {
    action = "open_circuit";
    nextEligibleAtEpochMs = input.nowEpochMs + policy.cooldownMs;
  } else {
    action = "retry";
    const exponentialDelay = Math.min(
      policy.baseDelayMs * 2 ** (input.consecutiveFailures - 1),
      60_000,
    );
    const delayMs = input.failure === "rate_limited"
      ? Math.max(30_000, exponentialDelay)
      : exponentialDelay;
    nextEligibleAtEpochMs = input.nowEpochMs + delayMs;
  }

  return {
    tenantId: input.tenantId,
    system: input.system,
    contractVersion: 1,
    action,
    nextEligibleAtEpochMs,
    coreDisposition: "continue",
  };
}

export function evaluateIntegrationCircuitGate(input: {
  tenantId: number;
  system: IntegrationSystem;
  contractVersion: number;
  nowEpochMs: number;
  circuit: {
    state: IntegrationCircuitState;
    openedAtEpochMs: number | null;
  };
}): {
  tenantId: number;
  system: IntegrationSystem;
  decision: IntegrationCircuitDecision;
  coreDisposition: "continue";
} {
  const policy = policyFor(input);
  const { state, openedAtEpochMs } = input.circuit;
  if (state !== "closed" && state !== "open" && state !== "half_open") {
    throw new Error("Estado de circuito inválido.");
  }
  if (state === "closed" && openedAtEpochMs !== null) {
    throw new Error("Circuito fechado não pode ter data de abertura.");
  }
  if (state !== "closed" &&
      (!Number.isSafeInteger(openedAtEpochMs) || openedAtEpochMs === null ||
        openedAtEpochMs < 0 || openedAtEpochMs > input.nowEpochMs)) {
    throw new Error("Circuito aberto ou em prova exige data válida de abertura.");
  }

  let decision: IntegrationCircuitDecision = "allow";
  if (state === "half_open") {
    decision = "probe_required";
  } else if (state === "open") {
    decision = input.nowEpochMs - (openedAtEpochMs as number) >= policy.cooldownMs
      ? "probe_required"
      : "block";
  }
  return {
    tenantId: input.tenantId, system: input.system,
    decision, coreDisposition: "continue",
  };
}
