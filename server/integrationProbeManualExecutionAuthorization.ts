import type { IntegrationSystem } from "../shared/integrationContracts";
import type {
  ProbeManualExecutionApproval,
  ProbeManualExecutionPlan,
} from "./integrationProbeManualExecutionPlan";

export type ProbeOneShotIntentIssueAuthorization = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  expectedCircuitVersion: number;
  approvalId: string;
  authorizationId: string;
  action: "issue_one_shot_probe_intent";
  authorizedByUserId: number;
  authorizedAtMs: number;
  expiresAtMs: number;
}>;

export type ProbeOneShotIntentIssueAuthorizationInput = Readonly<{
  approval: ProbeManualExecutionApproval;
  manualPlan: ProbeManualExecutionPlan;
  executionAuthorization: ProbeOneShotIntentIssueAuthorization;
  evaluatedAtMs: number;
}>;

export type ProbeOneShotIntentIssueAuthorizationResult = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  expectedCircuitVersion: number;
  approvalId: string;
  authorizationId: string;
  status: "authorized_to_issue_one_shot_intent";
  permitsIntentIssue: true;
  permitsProbe: false;
  permitsReplay: false;
  permitsExternalCall: false;
  permitsAutomaticReplay: false;
}>;

const MAX_EXECUTION_AUTHORIZATION_WINDOW_MS = 5 * 60 * 1000;
const IDENTIFIER = /^[A-Z0-9][A-Z0-9_-]{7,79}$/;

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function assertApprovalStillValid(
  approval: ProbeManualExecutionApproval,
  evaluatedAtMs: number,
): void {
  if (!approval
    || !positiveSafeInteger(approval.organizationId)
    || !positiveSafeInteger(approval.expectedCircuitVersion)
    || approval.requestedAction !== "probe_once"
    || !positiveSafeInteger(approval.requestedByUserId)
    || !positiveSafeInteger(approval.approvedByUserId)
    || approval.requestedByUserId === approval.approvedByUserId
    || typeof approval.approvalId !== "string"
    || !IDENTIFIER.test(approval.approvalId)
    || !nonNegativeSafeInteger(approval.approvedAtMs)
    || !nonNegativeSafeInteger(approval.expiresAtMs)
    || approval.expiresAtMs <= approval.approvedAtMs
    || evaluatedAtMs < approval.approvedAtMs
    || evaluatedAtMs > approval.expiresAtMs) {
    throw new Error("Aprovação administrativa inválida ou expirada para a autorização J38.");
  }
}

function assertManualPlan(
  plan: ProbeManualExecutionPlan,
  approval: ProbeManualExecutionApproval,
): void {
  if (!plan
    || plan.status !== "ready_for_manual_operator_review"
    || plan.organizationId !== approval.organizationId
    || plan.system !== approval.system
    || plan.expectedCircuitVersion !== approval.expectedCircuitVersion
    || plan.approvalId !== approval.approvalId
    || plan.requestedAction !== approval.requestedAction) {
    throw new Error("Plano manual J37 diverge do escopo, versão ou aprovação esperados.");
  }

  if (plan.permitsProbe
    || plan.permitsReplay
    || plan.permitsExternalCall
    || plan.permitsAutomaticReplay) {
    throw new Error("Plano manual J37 inválido: permissões de execução não podem estar habilitadas.");
  }

  if (!Array.isArray(plan.steps)
    || !plan.steps.includes("require_separate_execution_authorization")) {
    throw new Error("Plano manual J37 não exige autorização separada de execução.");
  }
}

function assertExecutionAuthorization(
  authorization: ProbeOneShotIntentIssueAuthorization,
  approval: ProbeManualExecutionApproval,
  evaluatedAtMs: number,
): void {
  if (!authorization
    || authorization.organizationId !== approval.organizationId
    || authorization.system !== approval.system
    || authorization.expectedCircuitVersion !== approval.expectedCircuitVersion
    || authorization.approvalId !== approval.approvalId
    || authorization.action !== "issue_one_shot_probe_intent") {
    throw new Error("Autorização J38 diverge do tenant, sistema, versão ou aprovação.");
  }

  if (!positiveSafeInteger(authorization.authorizedByUserId)
    || authorization.authorizedByUserId === approval.requestedByUserId
    || authorization.authorizedByUserId === approval.approvedByUserId) {
    throw new Error("Autorização J38 deve ser separada do solicitante e do aprovador administrativo.");
  }

  if (typeof authorization.authorizationId !== "string"
    || !IDENTIFIER.test(authorization.authorizationId)) {
    throw new Error("Identificador da autorização J38 é inválido.");
  }

  if (!nonNegativeSafeInteger(authorization.authorizedAtMs)
    || !nonNegativeSafeInteger(authorization.expiresAtMs)
    || authorization.expiresAtMs <= authorization.authorizedAtMs
    || authorization.expiresAtMs - authorization.authorizedAtMs > MAX_EXECUTION_AUTHORIZATION_WINDOW_MS) {
    throw new Error("Janela da autorização J38 é inválida ou excessiva.");
  }

  if (authorization.authorizedAtMs < approval.approvedAtMs
    || authorization.expiresAtMs > approval.expiresAtMs) {
    throw new Error("Autorização J38 deve permanecer dentro da janela da aprovação administrativa.");
  }

  if (evaluatedAtMs < authorization.authorizedAtMs) {
    throw new Error("Autorização J38 ainda está no futuro para o instante avaliado.");
  }

  if (evaluatedAtMs > authorization.expiresAtMs) {
    throw new Error("Autorização J38 está expirada.");
  }
}

/**
 * J38 authorizes only the future issuance of a one-shot intent.
 * It deliberately does not issue/consume the intent and never authorizes
 * probe execution, replay, external calls, or automatic replay.
 */
export function authorizeIntegrationProbeOneShotIntentIssue(
  input: ProbeOneShotIntentIssueAuthorizationInput,
): ProbeOneShotIntentIssueAuthorizationResult {
  if (!input || !nonNegativeSafeInteger(input.evaluatedAtMs)) {
    throw new Error("Instante de avaliação da autorização J38 é inválido.");
  }

  assertApprovalStillValid(input.approval, input.evaluatedAtMs);
  assertManualPlan(input.manualPlan, input.approval);
  assertExecutionAuthorization(
    input.executionAuthorization,
    input.approval,
    input.evaluatedAtMs,
  );

  return Object.freeze({
    organizationId: input.approval.organizationId,
    system: input.approval.system,
    expectedCircuitVersion: input.approval.expectedCircuitVersion,
    approvalId: input.approval.approvalId,
    authorizationId: input.executionAuthorization.authorizationId,
    status: "authorized_to_issue_one_shot_intent",
    permitsIntentIssue: true,
    permitsProbe: false,
    permitsReplay: false,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  });
}
