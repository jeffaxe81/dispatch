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
  const safeResult = result as Readonly<{
    organizationId?: unknown;
    system?: unknown;
    state?: unknown;
    version?: unknown;
  }>;

  const organizationId =
    typeof safeResult.organizationId === "number"
      ? safeResult.organizationId
      : input.approval.organizationId;
  const system =
    typeof safeResult.system === "string"
      ? safeResult.system
      : input.approval.system;
  const state =
    typeof safeResult.state === "string"
      ? safeResult.state
      : "completed";
  const version =
    typeof safeResult.version === "number" && Number.isInteger(safeResult.version)
      ? safeResult.version
      : null;

  return Object.freeze({
    executionId,
    organizationId,
    system,
    state,
    version,
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
