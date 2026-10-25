import type { IntegrationSystem } from "../shared/integrationContracts";
import type {
  ProbeAdministrativeGateResult,
} from "./integrationProbeAdminGate";
import type { ProbeAuditStatus } from "./integrationProbeAuditReconciler";

export type ProbeManualExecutionApproval = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  expectedCircuitVersion: number;
  requestedAction: "probe_once";
  approvalId: string;
  requestedByUserId: number;
  approvedByUserId: number;
  approvedAtMs: number;
  expiresAtMs: number;
}>;

export type ProbeManualExecutionReconciliation = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  expectedCircuitVersion: number;
  status: ProbeAuditStatus;
  observedAtMs: number;
}>;

export type ProbeManualExecutionPlanInput = Readonly<{
  approval: ProbeManualExecutionApproval;
  administrativeGate: ProbeAdministrativeGateResult;
  freshReconciliation: ProbeManualExecutionReconciliation;
  planCreatedAtMs: number;
}>;

export type ProbeManualExecutionPlanStep =
  | "verify_scope_and_approval"
  | "verify_fresh_reconciliation"
  | "verify_circuit_version"
  | "prepare_one_shot_intent"
  | "require_separate_execution_authorization";

export type ProbeManualExecutionPlan = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  expectedCircuitVersion: number;
  approvalId: string;
  requestedAction: "probe_once";
  status: "ready_for_manual_operator_review";
  steps: readonly ProbeManualExecutionPlanStep[];
  permitsProbe: false;
  permitsReplay: false;
  permitsExternalCall: false;
  permitsAutomaticReplay: false;
}>;

const MAX_RECONCILIATION_AGE_MS = 2 * 60 * 1000;
const APPROVAL_ID = /^[A-Z0-9][A-Z0-9_-]{7,79}$/;

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

function assertApproval(
  approval: ProbeManualExecutionApproval,
  gate: ProbeAdministrativeGateResult,
  nowMs: number,
): void {
  if (!approval
    || !positiveSafeInteger(approval.organizationId)
    || !positiveSafeInteger(approval.expectedCircuitVersion)
    || approval.requestedAction !== "probe_once"
    || !positiveSafeInteger(approval.requestedByUserId)
    || !positiveSafeInteger(approval.approvedByUserId)
    || approval.requestedByUserId === approval.approvedByUserId
    || typeof approval.approvalId !== "string"
    || !APPROVAL_ID.test(approval.approvalId)
    || !nonNegativeSafeInteger(approval.approvedAtMs)
    || !nonNegativeSafeInteger(approval.expiresAtMs)
    || approval.expiresAtMs <= approval.approvedAtMs
    || nowMs < approval.approvedAtMs
    || nowMs > approval.expiresAtMs) {
    throw new Error("Aprovação administrativa inválida, autoaprovada ou expirada.");
  }

  if (gate.status !== "eligible_for_manual_execution_plan") {
    throw new Error("Gate administrativo não está elegível para plano manual.");
  }

  if (gate.organizationId !== approval.organizationId
    || gate.system !== approval.system
    || gate.expectedCircuitVersion !== approval.expectedCircuitVersion
    || gate.requestedAction !== approval.requestedAction
    || gate.approvalId !== approval.approvalId) {
    throw new Error("Aprovação diverge do gate administrativo ou do escopo esperado.");
  }

  if (gate.permitsProbe
    || gate.permitsReplay
    || gate.permitsExternalCall
    || gate.permitsAutomaticReplay) {
    throw new Error("Gate administrativo inválido: permissões de execução não podem estar habilitadas.");
  }
}

function assertFreshReconciliation(
  reconciliation: ProbeManualExecutionReconciliation,
  approval: ProbeManualExecutionApproval,
  planCreatedAtMs: number,
): void {
  if (!reconciliation
    || reconciliation.organizationId !== approval.organizationId
    || reconciliation.system !== approval.system
    || reconciliation.expectedCircuitVersion !== approval.expectedCircuitVersion) {
    throw new Error("Escopo ou versão da reconciliação diverge da aprovação.");
  }

  if (reconciliation.status !== "manual_review_required") {
    throw new Error("Reconciliação deve permanecer em manual_review_required.");
  }

  if (!nonNegativeSafeInteger(reconciliation.observedAtMs)
    || reconciliation.observedAtMs > planCreatedAtMs
    || planCreatedAtMs - reconciliation.observedAtMs > MAX_RECONCILIATION_AGE_MS) {
    throw new Error("Reconciliação não está fresca para montar o plano manual.");
  }
}

/**
 * J37 is planning-only. It composes approval + fresh reconciliation into an
 * immutable operator-review plan and intentionally never authorizes execution.
 */
export function buildIntegrationProbeManualExecutionPlan(
  input: ProbeManualExecutionPlanInput,
): ProbeManualExecutionPlan {
  if (!input || !nonNegativeSafeInteger(input.planCreatedAtMs)) {
    throw new Error("Instante de criação do plano manual é inválido.");
  }

  assertApproval(input.approval, input.administrativeGate, input.planCreatedAtMs);
  assertFreshReconciliation(
    input.freshReconciliation,
    input.approval,
    input.planCreatedAtMs,
  );

  const steps = Object.freeze<ProbeManualExecutionPlanStep[]>([
    "verify_scope_and_approval",
    "verify_fresh_reconciliation",
    "verify_circuit_version",
    "prepare_one_shot_intent",
    "require_separate_execution_authorization",
  ]);

  return Object.freeze({
    organizationId: input.approval.organizationId,
    system: input.approval.system,
    expectedCircuitVersion: input.approval.expectedCircuitVersion,
    approvalId: input.approval.approvalId,
    requestedAction: "probe_once",
    status: "ready_for_manual_operator_review",
    steps,
    permitsProbe: false,
    permitsReplay: false,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  });
}
