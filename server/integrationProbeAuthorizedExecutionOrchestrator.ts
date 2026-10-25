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
  Pick<
    ExecutorResult,
    | "organizationId"
    | "system"
    | "state"
    | "version"
    | "consecutiveFailures"
    | "openedAtMs"
    | "cooldownUntilMs"
    | "permitsExternalCall"
    | "permitsProbe"
    | "permitsAutomaticReplay"
  >
>;

function projectPublicExecutionResult(
  result: ExecutorResult,
): AuthorizedProbeExecutionResult {
  return Object.freeze({
    organizationId: result.organizationId,
    system: result.system,
    state: result.state,
    version: result.version,
    consecutiveFailures: result.consecutiveFailures,
    openedAtMs: result.openedAtMs,
    cooldownUntilMs: result.cooldownUntilMs,
    permitsExternalCall: result.permitsExternalCall,
    permitsProbe: result.permitsProbe,
    permitsAutomaticReplay: result.permitsAutomaticReplay,
  });
}

/**
 * J42 composes the already-authorized J39 -> J40 -> J32 path.
 *
 * The return value is projected through an explicit positive allowlist. This
 * keeps lease/execution tokens, authorization identifiers, storage metadata,
 * internal ids and any future persistence-only fields inside the backend
 * execution boundary. Atomic one-shot consumption is still exclusively
 * performed by J32.
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
