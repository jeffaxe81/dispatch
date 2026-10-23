import type {
  ProbeAuditStatus,
} from "./integrationProbeAuditReconciler";
import type { IntegrationSystem } from "../shared/integrationContracts";

export type ProbeAdministrativeApprovalInput = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  expectedCircuitVersion: number;
  reconciliationStatus: ProbeAuditStatus;
  requestedAction: "probe_once";
  requestedByUserId: number;
  approvedByUserId: number;
  approvalId: string;
  reason: string;
  approvedAtMs: number;
  expiresAtMs: number;
}>;

export type ProbeAdministrativeGateStatus =
  | "eligible_for_manual_execution_plan"
  | "blocked_invalid"
  | "blocked_expired"
  | "blocked_self_approval"
  | "blocked_reconciliation";

export type ProbeAdministrativeGateResult = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  expectedCircuitVersion: number;
  requestedAction: "probe_once";
  status: ProbeAdministrativeGateStatus;
  requiresFreshReconciliation: true;
  requiresExecutionPlan: true;
  permitsProbe: false;
  permitsReplay: false;
  permitsExternalCall: false;
  permitsAutomaticReplay: false;
}>;

const ALLOWED_SYSTEMS = new Set<IntegrationSystem>(["neo", "inventory", "crm"]);
const APPROVAL_ID = /^[A-Z0-9][A-Z0-9_-]{7,79}$/;
const MAX_APPROVAL_WINDOW_MS = 15 * 60 * 1000;

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

function output(
  input: ProbeAdministrativeApprovalInput,
  status: ProbeAdministrativeGateStatus,
): ProbeAdministrativeGateResult {
  return Object.freeze({
    organizationId: input.organizationId,
    system: input.system,
    expectedCircuitVersion: input.expectedCircuitVersion,
    requestedAction: "probe_once",
    status,
    requiresFreshReconciliation: true,
    requiresExecutionPlan: true,
    permitsProbe: false,
    permitsReplay: false,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  });
}

function validInput(
  input: ProbeAdministrativeApprovalInput,
  nowMs: number,
): boolean {
  if (!input || !positiveSafeInteger(input.organizationId)
    || !ALLOWED_SYSTEMS.has(input.system)
    || !positiveSafeInteger(input.expectedCircuitVersion)
    || input.requestedAction !== "probe_once"
    || !positiveSafeInteger(input.requestedByUserId)
    || !positiveSafeInteger(input.approvedByUserId)
    || typeof input.approvalId !== "string"
    || !APPROVAL_ID.test(input.approvalId)
    || typeof input.reason !== "string"
    || input.reason.trim().length < 10
    || input.reason.trim().length > 500
    || !nonNegativeSafeInteger(input.approvedAtMs)
    || !nonNegativeSafeInteger(input.expiresAtMs)
    || !nonNegativeSafeInteger(nowMs)
    || input.expiresAtMs <= input.approvedAtMs
    || input.expiresAtMs - input.approvedAtMs > MAX_APPROVAL_WINDOW_MS
    || nowMs < input.approvedAtMs) {
    return false;
  }
  return true;
}

/**
 * J36 keeps the J35 administrative-readiness contract, now consolidated on
 * the MySQL-validated J34 snapshot line. Even a valid approval never authorizes
 * a probe/replay/external call; it only permits assembling a future manual plan.
 */
export function assessIntegrationProbeAdministrativeApproval(
  input: ProbeAdministrativeApprovalInput,
  nowMs: number,
): ProbeAdministrativeGateResult {
  if (!validInput(input, nowMs)) return output(input, "blocked_invalid");
  if (input.requestedByUserId === input.approvedByUserId) {
    return output(input, "blocked_self_approval");
  }
  if (nowMs > input.expiresAtMs) return output(input, "blocked_expired");
  if (input.reconciliationStatus !== "manual_review_required") {
    return output(input, "blocked_reconciliation");
  }
  return output(input, "eligible_for_manual_execution_plan");
}

function assertJ35Gate(): void {
  if (process.env.NODE_ENV !== "test"
    || process.env.AXE_RUNTIME_ENV !== "homologation"
    || process.env.AXE_INTEGRATION_PROBE_J35_ENABLED !== "true") {
    throw new Error("Gate administrativo J35 desabilitado fora da homologação opt-in.");
  }
}

export function createIntegrationProbeAdminGate() {
  return Object.freeze({
    assess(input: ProbeAdministrativeApprovalInput, nowMs: number) {
      assertJ35Gate();
      return assessIntegrationProbeAdministrativeApproval(input, nowMs);
    },
  });
}
