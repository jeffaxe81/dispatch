import type { IntegrationProbeExecutionPlan } from "./integrationCircuitProbeExecutionIntent";
import { consumeProbeExecutionIntent } from "./integrationCircuitProbeExecutionIntent";
import {
  authorizeIntegrationProbeOneShotIntentIssue,
  type ProbeOneShotIntentIssueAuthorization,
} from "./integrationProbeManualExecutionAuthorization";
import type {
  ProbeManualExecutionApproval,
  ProbeManualExecutionPlan,
} from "./integrationProbeManualExecutionPlan";

export type AuthorizedProbeIntentConsumableState = IntegrationProbeExecutionPlan & Readonly<{
  approvalId: string;
  authorizationId: string;
  status: string;
  permitsReplay: boolean;
}>;

export type AuthorizedProbeOneShotIntentConsumptionInput = Readonly<{
  approval: ProbeManualExecutionApproval;
  manualPlan: ProbeManualExecutionPlan;
  executionAuthorization: ProbeOneShotIntentIssueAuthorization;
  current: AuthorizedProbeIntentConsumableState;
  nowEpochMs: number;
}>;

export type AuthorizedProbeOneShotIntentConsumptionResult = IntegrationProbeExecutionPlan & Readonly<{
  approvalId: string;
  authorizationId: string;
  status: "one_shot_intent_consumed_for_probe_grant";
  permitsProbe: true;
  permitsReplay: false;
  permitsExternalCall: false;
  permitsAutomaticReplay: false;
}>;

function assertIssuedState(
  current: AuthorizedProbeIntentConsumableState,
  authorization: ProbeOneShotIntentIssueAuthorization,
): void {
  if (current.status !== "one_shot_intent_issued") {
    throw new Error("Intenção one-shot não está no estado emitido ou já foi consumida.");
  }
  if (current.organizationId !== authorization.organizationId
    || current.system !== authorization.system) {
    throw new Error("Intenção emitida diverge do tenant ou sistema autorizados.");
  }
  if (current.approvalId !== authorization.approvalId) {
    throw new Error("Identificador da aprovação da intenção diverge do escopo autorizado.");
  }
  if (current.authorizationId !== authorization.authorizationId) {
    throw new Error("Identificador da autorização da intenção diverge do escopo autorizado.");
  }
  if (!Number.isSafeInteger(current.circuitVersion)
    || current.circuitVersion !== authorization.expectedCircuitVersion + 1) {
    throw new Error("Versão da intenção emitida diverge da versão autorizada.");
  }
  if (current.permitsProbe !== false
    || current.permitsExternalCall !== false
    || current.permitsAutomaticReplay !== false
    || current.permitsReplay !== false) {
    throw new Error("Intenção emitida contém permissões incompatíveis antes do consumo.");
  }
  if (current.executionConsumedAtMs !== null) {
    throw new Error("Intenção one-shot já consumida.");
  }
  if (current.leaseToken === null || current.executionToken === null) {
    throw new Error("Intenção one-shot sem lease ou token de execução válido.");
  }
}

/**
 * J40 consumes a previously issued J39 one-shot intent only while the J38
 * authorization remains valid. It produces the internal one-shot probe grant,
 * but does not execute J32, replay anything, or perform external calls.
 */
export function consumeAuthorizedIntegrationProbeOneShotIntent(
  input: AuthorizedProbeOneShotIntentConsumptionInput,
): AuthorizedProbeOneShotIntentConsumptionResult {
  const authorized = authorizeIntegrationProbeOneShotIntentIssue({
    approval: input.approval,
    manualPlan: input.manualPlan,
    executionAuthorization: input.executionAuthorization,
    evaluatedAtMs: input.nowEpochMs,
  });

  assertIssuedState(input.current, input.executionAuthorization);

  if (authorized.authorizationId !== input.current.authorizationId
    || authorized.approvalId !== input.current.approvalId) {
    throw new Error("Autorização J38 diverge da intenção J39 emitida.");
  }

  const grant = consumeProbeExecutionIntent(input.current, {
    nowEpochMs: input.nowEpochMs,
    expectedVersion: input.current.circuitVersion,
    leaseToken: input.current.leaseToken as string,
    executionToken: input.current.executionToken as string,
  });

  return Object.freeze({
    ...grant,
    approvalId: authorized.approvalId,
    authorizationId: authorized.authorizationId,
    status: "one_shot_intent_consumed_for_probe_grant",
    permitsProbe: true,
    permitsReplay: false,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  });
}
