import type { IntegrationSystem } from "../shared/integrationContracts";
import {
  buildProbeExecutionIntent,
  type IntegrationProbeExecutionPlan,
  type IntegrationProbeExecutionSnapshot,
} from "./integrationCircuitProbeExecutionIntent";
import {
  authorizeIntegrationProbeOneShotIntentIssue,
  type ProbeOneShotIntentIssueAuthorization,
} from "./integrationProbeManualExecutionAuthorization";
import type {
  ProbeManualExecutionApproval,
  ProbeManualExecutionPlan,
} from "./integrationProbeManualExecutionPlan";

export type AuthorizedProbeOneShotIntentIssueInput = Readonly<{
  approval: ProbeManualExecutionApproval;
  manualPlan: ProbeManualExecutionPlan;
  executionAuthorization: ProbeOneShotIntentIssueAuthorization;
  current: IntegrationProbeExecutionSnapshot;
  nowEpochMs: number;
  executionToken: string;
  executionDurationMs: number;
}>;

export type AuthorizedProbeOneShotIntentIssueResult = IntegrationProbeExecutionPlan & Readonly<{
  approvalId: string;
  authorizationId: string;
  status: "one_shot_intent_issued";
  permitsReplay: false;
}>;

function assertSnapshotScope(
  current: IntegrationProbeExecutionSnapshot,
  authorized: Readonly<{
    organizationId: number;
    system: IntegrationSystem;
    expectedCircuitVersion: number;
  }>,
): void {
  if (current.organizationId !== authorized.organizationId
    || current.system !== authorized.system) {
    throw new Error("Snapshot do circuito diverge do tenant ou sistema autorizados.");
  }
  if (current.circuitVersion !== authorized.expectedCircuitVersion) {
    throw new Error("Snapshot do circuito diverge da versão autorizada.");
  }
}

function assertIntentWithinAuthorizationWindow(
  nowEpochMs: number,
  executionDurationMs: number,
  authorization: ProbeOneShotIntentIssueAuthorization,
): void {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0
    || !Number.isSafeInteger(executionDurationMs) || executionDurationMs <= 0) {
    throw new Error("Instante ou duração da intenção J39 inválidos.");
  }
  if (nowEpochMs > authorization.expiresAtMs) {
    throw new Error("Autorização J38 expirada para emissão da intenção.");
  }
  const expiresAtMs = nowEpochMs + executionDurationMs;
  if (!Number.isSafeInteger(expiresAtMs)
    || expiresAtMs > authorization.expiresAtMs) {
    throw new Error("Intenção J39 ultrapassa a janela da autorização J38.");
  }
}

/**
 * J39 bridges the separate J38 authorization to the existing J31 one-shot
 * intent builder. It issues/prepares the intent only; it does not consume the
 * intent and therefore never permits probe execution, replay or external calls.
 */
export function issueAuthorizedIntegrationProbeOneShotIntent(
  input: AuthorizedProbeOneShotIntentIssueInput,
): AuthorizedProbeOneShotIntentIssueResult {
  const authorized = authorizeIntegrationProbeOneShotIntentIssue({
    approval: input.approval,
    manualPlan: input.manualPlan,
    executionAuthorization: input.executionAuthorization,
    evaluatedAtMs: input.nowEpochMs,
  });

  assertSnapshotScope(input.current, authorized);
  assertIntentWithinAuthorizationWindow(
    input.nowEpochMs,
    input.executionDurationMs,
    input.executionAuthorization,
  );

  if (input.current.leaseToken === null) {
    throw new Error("Emissão da intenção J39 exige lease de probe ativo.");
  }

  const intent = buildProbeExecutionIntent(input.current, {
    nowEpochMs: input.nowEpochMs,
    expectedVersion: authorized.expectedCircuitVersion,
    leaseToken: input.current.leaseToken,
    executionToken: input.executionToken,
    executionDurationMs: input.executionDurationMs,
  });

  return Object.freeze({
    ...intent,
    approvalId: authorized.approvalId,
    authorizationId: authorized.authorizationId,
    status: "one_shot_intent_issued",
    permitsReplay: false,
    permitsProbe: false,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  });
}
