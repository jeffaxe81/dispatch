import {
  executeAuthorizedIntegrationProbeOnce,
  type AuthorizedProbeExecutionOrchestratorDependencies,
  type AuthorizedProbeExecutionOrchestratorInput,
  type AuthorizedProbeExecutionResult,
} from "./integrationProbeAuthorizedExecutionOrchestrator";

export type AuthorizedProbeExecutionReceipt = Readonly<{
  executionId: string;
  organizationId: number;
  system: string;
  state: string;
  version: number | null;
  executedAtMs: number;
  durationMs: number;
  outcome: "success";
}>;

export type AuthorizedProbeExecutionWithReceipt = Readonly<{
  result: AuthorizedProbeExecutionResult;
  receipt: AuthorizedProbeExecutionReceipt;
}>;

function normalizeExecutionId(value: string): string {
  const executionId = value.trim();
  if (!executionId || executionId.length > 120) {
    throw new Error("executionId inválido para recibo da execução autorizada.");
  }
  return executionId;
}

function projectReceipt(
  executionId: string,
  input: AuthorizedProbeExecutionOrchestratorInput,
  result: AuthorizedProbeExecutionResult,
  startedAtMs: number,
  finishedAtMs: number,
): AuthorizedProbeExecutionReceipt {
  if (!Number.isSafeInteger(result.organizationId) || result.organizationId <= 0) {
    throw new Error("Organização inválida no resultado da execução autorizada.");
  }
  if (result.organizationId !== input.approval.organizationId) {
    throw new Error("Organização do resultado diverge do escopo aprovado.");
  }
  if (typeof result.system !== "string" || !result.system.trim()) {
    throw new Error("Sistema inválido no resultado da execução autorizada.");
  }
  if (result.system !== input.approval.system) {
    throw new Error("Sistema do resultado diverge do escopo aprovado.");
  }
  if (!["closed", "open", "half_open"].includes(result.state)) {
    throw new Error("Estado do circuito inválido no resultado da execução autorizada.");
  }
  if (!Number.isSafeInteger(result.version) || result.version < 0) {
    throw new Error("Versão inválida no resultado da execução autorizada.");
  }

  return Object.freeze({
    executionId,
    organizationId: result.organizationId,
    system: result.system,
    state: result.state,
    version: result.version,
    executedAtMs: finishedAtMs,
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    outcome: "success" as const,
  });
}

/**
 * J43 adds a public, sanitized execution receipt on top of J42.
 *
 * The receipt intentionally contains no lease token, execution token,
 * approval identifier or authorization identifier.
 */
export async function executeAuthorizedIntegrationProbeOnceWithReceipt(
  executionId: string,
  input: AuthorizedProbeExecutionOrchestratorInput,
  dependencies: AuthorizedProbeExecutionOrchestratorDependencies,
  clock: Readonly<{ now(): number }> = { now: () => Date.now() },
): Promise<AuthorizedProbeExecutionWithReceipt> {
  const safeExecutionId = normalizeExecutionId(executionId);
  const startedAtMs = clock.now();
  const result = await executeAuthorizedIntegrationProbeOnce(input, dependencies);
  const finishedAtMs = clock.now();

  return Object.freeze({
    result,
    receipt: projectReceipt(
      safeExecutionId,
      input,
      result,
      startedAtMs,
      finishedAtMs,
    ),
  });
}
