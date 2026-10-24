import type { createIntegrationProbeExecutor } from "./integrationProbeExecutor";
import {
  issueAuthorizedIntegrationProbeOneShotIntent,
  type AuthorizedProbeOneShotIntentIssueInput,
} from "./integrationProbeAuthorizedIntentIssue";
import {
  prepareAuthorizedIntegrationProbeExecutionHandoff,
  type AuthorizedProbeExecutionHandoff,
} from "./integrationProbeAuthorizedIntentConsumption";

type Executor = Pick<ReturnType<typeof createIntegrationProbeExecutor>, "execute">;
type ExecutorResult = Awaited<ReturnType<Executor["execute"]>>;

export type AuthorizedProbeExecutionOrchestratorInput =
  AuthorizedProbeOneShotIntentIssueInput & Readonly<{
    cooldownSeconds: number;
  }>;

export type AuthorizedProbeExecutionOrchestratorDependencies = Readonly<{
  executor: Executor;
}>;

export type AuthorizedProbeExecutionResult = Readonly<
  Omit<ExecutorResult, "leaseToken" | "executionToken">
>;

function projectPublicExecutionResult(
  result: ExecutorResult,
): AuthorizedProbeExecutionResult {
  const raw = result as ExecutorResult & Readonly<{
    approvalId?: unknown;
    authorizationId?: unknown;
  }>;
  const {
    leaseToken: _leaseToken,
    executionToken: _executionToken,
    approvalId: _approvalId,
    authorizationId: _authorizationId,
    ...safe
  } = raw;
  return Object.freeze(safe) as AuthorizedProbeExecutionResult;
}

/**
 * J42 composes the already-authorized J39 -> J40 -> J32 path.
 *
 * It deliberately does not expose the issued intent or the J40 handoff in the
 * return value, so lease/execution tokens and authorization identifiers remain
 * internal to the backend execution boundary. Atomic one-shot consumption is
 * still exclusively performed by J32.
 */
export async function executeAuthorizedIntegrationProbeOnce(
  input: AuthorizedProbeExecutionOrchestratorInput,
  dependencies: AuthorizedProbeExecutionOrchestratorDependencies,
): Promise<AuthorizedProbeExecutionResult> {
  if (!dependencies || !dependencies.executor || typeof dependencies.executor.execute !== "function") {
    throw new Error("Executor J32 obrigatório para a orquestração autorizada.");
  }

  const issued = issueAuthorizedIntegrationProbeOneShotIntent({
    approval: input.approval,
    manualPlan: input.manualPlan,
    executionAuthorization: input.executionAuthorization,
    current: input.current,
    nowEpochMs: input.nowEpochMs,
    executionToken: input.executionToken,
    executionDurationMs: input.executionDurationMs,
  });

  const handoff: AuthorizedProbeExecutionHandoff =
    prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval: input.approval,
      manualPlan: input.manualPlan,
      executionAuthorization: input.executionAuthorization,
      current: issued,
      nowEpochMs: input.nowEpochMs,
      cooldownSeconds: input.cooldownSeconds,
    });

  return projectPublicExecutionResult(
    await dependencies.executor.execute(handoff),
  );
}
