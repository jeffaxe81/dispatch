import {
  assertIntegrationContractCompatibility,
  type IntegrationSystem,
} from "./integrationContracts";

/**
 * J24: diagnostic contract comparison only. It never authorizes dispatch,
 * probes, retries or remote IO, even when all numeric parameters match.
 *
 * J13 #145 policy is loaded from per-outbox/persisted configuration.
 * J13 #146 reference profile contains static per-adapter defaults. These
 * profiles are not interchangeable by name alone.
 */
export type J13PersistedPolicyProfile = Readonly<{
  system: IntegrationSystem;
  maxAttempts: number;
  failureThreshold: number;
  cooldownSeconds: number;
}>;
export type J13ReferenceAdapterProfile = Readonly<{
  system: IntegrationSystem;
  maxAttempts: number;
  openAfterFailures: number;
  cooldownMs: number;
}>;
export type J13PolicyDivergence =
  | "max_attempts_mismatch"
  | "failure_threshold_mismatch"
  | "cooldown_mismatch"
  | "retry_backoff_not_equivalent"
  | "permanent_failure_not_equivalent"
  | "attempt_counter_not_equivalent";
export type J13PolicyComparison = Readonly<{
  system: IntegrationSystem;
  contractVersion: 1;
  parametersAligned: boolean;
  /** Even aligned profiles are not identical state machines. */
  algorithmsEquivalent: false;
  needsDedicatedCircuitLease: true;
  permitsProbe: false;
  permitsExternalCall: false;
  coreDisposition: "continue";
  differences: readonly J13PolicyDivergence[];
}>;

function positive(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(field + " inválido para comparação J13.");
  }
}

/** Inspect profile differences; never translate one decision into a grant. */
export function compareJ13PolicyProfiles(input: {
  tenantId: number;
  contractVersion: number;
  persisted: J13PersistedPolicyProfile;
  reference: J13ReferenceAdapterProfile;
}): J13PolicyComparison {
  positive(input.tenantId, "Tenant");
  const system = input.persisted?.system ?? "";
  assertIntegrationContractCompatibility({ system, requestedVersion: input.contractVersion });
  assertIntegrationContractCompatibility({
    system: input.reference?.system ?? "",
    requestedVersion: input.contractVersion,
  });
  if (system !== input.reference.system) {
    throw new Error("Perfis de sistemas diferentes não podem ser reconciliados.");
  }
  positive(input.persisted.maxAttempts, "Tentativas persistidas");
  positive(input.persisted.failureThreshold, "Limiar persistido");
  positive(input.persisted.cooldownSeconds, "Cooldown persistido");
  positive(input.reference.maxAttempts, "Tentativas de referência");
  positive(input.reference.openAfterFailures, "Limiar de referência");
  positive(input.reference.cooldownMs, "Cooldown de referência");

  const differences: J13PolicyDivergence[] = [];
  if (input.persisted.maxAttempts !== input.reference.maxAttempts) {
    differences.push("max_attempts_mismatch");
  }
  if (input.persisted.failureThreshold !== input.reference.openAfterFailures) {
    differences.push("failure_threshold_mismatch");
  }
  if (input.persisted.cooldownSeconds * 1000 !== input.reference.cooldownMs) {
    differences.push("cooldown_mismatch");
  }
  const parametersAligned = differences.length === 0;
  differences.push(
    "retry_backoff_not_equivalent",
    "permanent_failure_not_equivalent",
    "attempt_counter_not_equivalent",
  );
  return Object.freeze({
    system,
    contractVersion: 1,
    parametersAligned,
    algorithmsEquivalent: false,
    needsDedicatedCircuitLease: true,
    permitsProbe: false,
    permitsExternalCall: false,
    coreDisposition: "continue",
    differences: Object.freeze(differences),
  });
}
