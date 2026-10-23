import type { IntegrationSystem } from "./integrationContracts";

export type IntegrationResiliencePolicy = {
  system: IntegrationSystem;
  maxAttempts: number;
  failureThreshold: number;
  cooldownSeconds: number;
};

export type IntegrationResilienceAction =
  | "allow"
  | "retry"
  | "open_circuit"
  | "half_open"
  | "exhausted";

export type IntegrationResilienceDecision = {
  tenantId: number;
  system: IntegrationSystem;
  action: IntegrationResilienceAction;
  allowAttempt: boolean;
  coreDisposition: "continue";
  retryAfterSeconds: number;
};

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} deve ser um inteiro positivo.`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser um inteiro não negativo.`);
  }
}

function assertValidDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} inválido.`);
  }
}

function baseDecision(
  tenantId: number,
  system: IntegrationSystem,
  action: IntegrationResilienceAction,
  allowAttempt: boolean,
  retryAfterSeconds = 0,
): IntegrationResilienceDecision {
  return {
    tenantId,
    system,
    action,
    allowAttempt,
    coreDisposition: "continue",
    retryAfterSeconds,
  };
}

export function evaluateIntegrationResilience(input: {
  tenantId: number;
  policy: IntegrationResiliencePolicy;
  nextAttempt: number;
  consecutiveFailures: number;
  circuitOpenedAt: Date | null;
  now: Date;
}): IntegrationResilienceDecision {
  assertPositiveInteger(input.tenantId, "Tenant");
  assertPositiveInteger(input.policy.maxAttempts, "Número máximo de tentativas");
  assertPositiveInteger(input.policy.failureThreshold, "Limiar de falhas");
  assertPositiveInteger(input.policy.cooldownSeconds, "Cooldown");
  assertPositiveInteger(input.nextAttempt, "Próxima tentativa");
  assertNonNegativeInteger(input.consecutiveFailures, "Falhas consecutivas");
  assertValidDate(input.now, "Relógio");

  if (input.circuitOpenedAt !== null) {
    assertValidDate(input.circuitOpenedAt, "Timestamp de abertura do circuito");
    if (input.circuitOpenedAt.getTime() > input.now.getTime()) {
      throw new Error("Timestamp de abertura do circuito não pode estar no futuro.");
    }
  }

  if (input.nextAttempt > input.policy.maxAttempts) {
    return baseDecision(input.tenantId, input.policy.system, "exhausted", false);
  }

  if (input.circuitOpenedAt !== null) {
    const elapsedSeconds = Math.floor(
      (input.now.getTime() - input.circuitOpenedAt.getTime()) / 1000,
    );
    const remainingSeconds = Math.max(
      0,
      input.policy.cooldownSeconds - elapsedSeconds,
    );

    if (remainingSeconds > 0) {
      return baseDecision(
        input.tenantId,
        input.policy.system,
        "open_circuit",
        false,
        remainingSeconds,
      );
    }

    return baseDecision(
      input.tenantId,
      input.policy.system,
      "half_open",
      // Cooldown expiry changes the circuit state, not authorization.
      // Only an exclusive, persisted tenant/system lease may allow a probe.
      false,
    );
  }

  if (input.consecutiveFailures >= input.policy.failureThreshold) {
    return baseDecision(
      input.tenantId,
      input.policy.system,
      "open_circuit",
      false,
      input.policy.cooldownSeconds,
    );
  }

  if (input.nextAttempt === 1) {
    return baseDecision(input.tenantId, input.policy.system, "allow", true);
  }

  return baseDecision(input.tenantId, input.policy.system, "retry", true);
}
