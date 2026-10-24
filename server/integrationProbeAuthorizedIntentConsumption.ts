import {
  assertIntegrationProbeExecutionSnapshot,
  type IntegrationProbeExecutionPlan,
} from "./integrationCircuitProbeExecutionIntent";
import {
  authorizeIntegrationProbeOneShotIntentIssue,
  type ProbeOneShotIntentIssueAuthorization,
} from "./integrationProbeManualExecutionAuthorization";
import type {
  ProbeManualExecutionApproval,
  ProbeManualExecutionPlan,
} from "./integrationProbeManualExecutionPlan";

export type AuthorizedProbeIntentHandoffState = IntegrationProbeExecutionPlan & Readonly<{
  approvalId: string;
  authorizationId: string;
  status: string;
  permitsReplay: boolean;
}>;

export type AuthorizedProbeExecutionHandoffInput = Readonly<{
  approval: ProbeManualExecutionApproval;
  manualPlan: ProbeManualExecutionPlan;
  executionAuthorization: ProbeOneShotIntentIssueAuthorization;
  current: AuthorizedProbeIntentHandoffState;
  nowEpochMs: number;
  cooldownSeconds: number;
}>;

export type AuthorizedProbeExecutionHandoff = Readonly<{
  organizationId: number;
  system: AuthorizedProbeIntentHandoffState["system"];
  expectedVersion: number;
  leaseToken: string;
  executionToken: string;
  cooldownSeconds: number;
  approvalId: string;
  authorizationId: string;
  status: "ready_for_j32_atomic_consumption";
  validUntilMs: number;
  permitsProbe: false;
  permitsReplay: false;
  permitsExternalCall: false;
  permitsAutomaticReplay: false;
}>;

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function assertIssuedState(
  current: AuthorizedProbeIntentHandoffState,
  authorization: ProbeOneShotIntentIssueAuthorization,
  nowEpochMs: number,
): asserts current is AuthorizedProbeIntentHandoffState & Readonly<{
  leaseToken: string;
  leaseExpiresAtMs: number;
  executionToken: string;
  executionExpiresAtMs: number;
}> {
  assertIntegrationProbeExecutionSnapshot(current);

  if (current.status !== "one_shot_intent_issued") {
    throw new Error("Intenção one-shot não está emitida ou já foi consumida.");
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
    throw new Error("Intenção emitida contém permissões incompatíveis antes do consumo atômico.");
  }
  if (current.executionConsumedAtMs !== null) {
    throw new Error("Intenção one-shot já consumida.");
  }
  if (current.leaseToken === null
    || current.leaseExpiresAtMs === null
    || current.executionToken === null
    || current.executionExpiresAtMs === null) {
    throw new Error("Intenção one-shot sem lease ou token de execução válido.");
  }
  if (nowEpochMs >= current.leaseExpiresAtMs || nowEpochMs >= current.executionExpiresAtMs) {
    throw new Error("Lease ou intenção one-shot expirada para handoff J40.");
  }
}

/**
 * J40 prepares the exact handoff required by J32 while deliberately keeping
 * the J31 one-shot intent unconsumed. The atomic consume remains inside J32,
 * immediately before its injected homologation-only probe callback.
 */
export function prepareAuthorizedIntegrationProbeExecutionHandoff(
  input: AuthorizedProbeExecutionHandoffInput,
): AuthorizedProbeExecutionHandoff {
  if (!Number.isSafeInteger(input.nowEpochMs) || input.nowEpochMs < 0) {
    throw new Error("Instante do handoff J40 inválido.");
  }
  if (!positiveSafeInteger(input.cooldownSeconds)) {
    throw new Error("Cooldown do handoff J40 inválido.");
  }

  const authorized = authorizeIntegrationProbeOneShotIntentIssue({
    approval: input.approval,
    manualPlan: input.manualPlan,
    executionAuthorization: input.executionAuthorization,
    evaluatedAtMs: input.nowEpochMs,
  });

  assertIssuedState(input.current, input.executionAuthorization, input.nowEpochMs);

  if (authorized.authorizationId !== input.current.authorizationId
    || authorized.approvalId !== input.current.approvalId) {
    throw new Error("Autorização J38 diverge da intenção J39 emitida.");
  }

  const validUntilMs = Math.min(
    input.current.executionExpiresAtMs,
    input.current.leaseExpiresAtMs,
    input.executionAuthorization.expiresAtMs,
  );

  return Object.freeze({
    organizationId: input.current.organizationId,
    system: input.current.system,
    expectedVersion: input.current.circuitVersion,
    leaseToken: input.current.leaseToken,
    executionToken: input.current.executionToken,
    cooldownSeconds: input.cooldownSeconds,
    approvalId: authorized.approvalId,
    authorizationId: authorized.authorizationId,
    status: "ready_for_j32_atomic_consumption",
    validUntilMs,
    permitsProbe: false,
    permitsReplay: false,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  });
}
