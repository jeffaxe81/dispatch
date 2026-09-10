import { createHash } from "node:crypto";
import {
  verifyRecoveryPostActionReconciliationReceipt,
  type RecoveryPostActionReconciliationReceipt,
} from "./recoveryPostActionReconciliationAudit";

export type RecoveryPostActionClosureReasonCode = Exclude<
  RecoveryPostActionReconciliationReceipt["reasonCode"],
  null
>;

export type RecoveryPostActionClosureReceipt = Readonly<{
  eventType: "recovery.post_action.closure";
  evidenceVersion: "d011b12-v1";
  evidenceId: string;
  reconciliationEvidenceId: string;
  executionEvidenceId: string;
  verificationEvidenceId: string;
  actionId: string;
  componentId: string;
  correlationId: string;
  fencingToken: number;
  closureStatus: "closed_verified" | "closed_rejected";
  reasonCode: RecoveryPostActionClosureReasonCode | null;
  reconciliationRecordedAt: string;
  recordedAt: string;
}>;

export type RecoveryPostActionClosureBuildResult =
  | Readonly<{ built: true; receipt: RecoveryPostActionClosureReceipt }>
  | Readonly<{
      built: false;
      reasonCode: "RECONCILIATION_EVIDENCE_INVALID";
    }>;

export type RecoveryPostActionClosureReceiptVerification =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode:
        | "EVIDENCE_MISMATCH"
        | "INVALID_CLOSURE_STATE"
        | "CLOSURE_TIMELINE_INVALID";
    }>;

const allowedRejectedReasons = new Set<RecoveryPostActionClosureReasonCode>([
  "EVIDENCE_CHAIN_INVALID",
  "EXECUTION_OUTCOME_INVALID",
  "POST_ACTION_NOT_VERIFIED",
  "LEDGER_IDENTITY_MISMATCH",
  "LEDGER_FENCING_MISMATCH",
  "LEDGER_STATE_INVALID",
]);

function hashRecoveryPostActionClosureEvidence(input: {
  tenantId: string;
  reconciliationEvidenceId: string;
  executionEvidenceId: string;
  verificationEvidenceId: string;
  actionId: string;
  componentId: string;
  correlationId: string;
  fencingToken: number;
  closureStatus: RecoveryPostActionClosureReceipt["closureStatus"];
  reasonCode: RecoveryPostActionClosureReasonCode | null;
  reconciliationRecordedAt: string;
  recordedAt: string;
}): string {
  const canonicalEvidence = JSON.stringify([
    "d011b12-v1",
    input.tenantId,
    input.reconciliationEvidenceId,
    input.executionEvidenceId,
    input.verificationEvidenceId,
    input.actionId,
    input.componentId,
    input.correlationId,
    input.fencingToken,
    input.closureStatus,
    input.reasonCode,
    input.reconciliationRecordedAt,
    input.recordedAt,
  ]);

  return createHash("sha256").update(canonicalEvidence, "utf8").digest("hex");
}

function isAllowedRejectedReason(
  value: RecoveryPostActionClosureReasonCode | null,
): value is RecoveryPostActionClosureReasonCode {
  return value !== null && allowedRejectedReasons.has(value);
}

export function buildRecoveryPostActionClosureReceipt(input: {
  tenantId: string;
  reconciliationReceipt: RecoveryPostActionReconciliationReceipt;
  recordedAt: string;
}): RecoveryPostActionClosureBuildResult {
  const reconciliation = verifyRecoveryPostActionReconciliationReceipt({
    tenantId: input.tenantId,
    receipt: input.reconciliationReceipt,
  });

  if (!reconciliation.valid) {
    return { built: false, reasonCode: "RECONCILIATION_EVIDENCE_INVALID" };
  }

  const closureStatus = input.reconciliationReceipt.eligible
    ? "closed_verified" as const
    : "closed_rejected" as const;
  const reasonCode = input.reconciliationReceipt.eligible
    ? null
    : input.reconciliationReceipt.reasonCode;

  if (closureStatus === "closed_rejected" && !isAllowedRejectedReason(reasonCode)) {
    return { built: false, reasonCode: "RECONCILIATION_EVIDENCE_INVALID" };
  }

  const evidenceId = hashRecoveryPostActionClosureEvidence({
    tenantId: input.tenantId,
    reconciliationEvidenceId: input.reconciliationReceipt.evidenceId,
    executionEvidenceId: input.reconciliationReceipt.executionEvidenceId,
    verificationEvidenceId: input.reconciliationReceipt.verificationEvidenceId,
    actionId: input.reconciliationReceipt.actionId,
    componentId: input.reconciliationReceipt.componentId,
    correlationId: input.reconciliationReceipt.correlationId,
    fencingToken: input.reconciliationReceipt.fencingToken,
    closureStatus,
    reasonCode,
    reconciliationRecordedAt: input.reconciliationReceipt.recordedAt,
    recordedAt: input.recordedAt,
  });

  return {
    built: true,
    receipt: {
      eventType: "recovery.post_action.closure",
      evidenceVersion: "d011b12-v1",
      evidenceId,
      reconciliationEvidenceId: input.reconciliationReceipt.evidenceId,
      executionEvidenceId: input.reconciliationReceipt.executionEvidenceId,
      verificationEvidenceId: input.reconciliationReceipt.verificationEvidenceId,
      actionId: input.reconciliationReceipt.actionId,
      componentId: input.reconciliationReceipt.componentId,
      correlationId: input.reconciliationReceipt.correlationId,
      fencingToken: input.reconciliationReceipt.fencingToken,
      closureStatus,
      reasonCode,
      reconciliationRecordedAt: input.reconciliationReceipt.recordedAt,
      recordedAt: input.recordedAt,
    },
  };
}

export function verifyRecoveryPostActionClosureReceipt(input: {
  tenantId: string;
  receipt: RecoveryPostActionClosureReceipt;
}): RecoveryPostActionClosureReceiptVerification {
  if (
    input.receipt.eventType !== "recovery.post_action.closure"
    || input.receipt.evidenceVersion !== "d011b12-v1"
  ) {
    return { valid: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  const expectedEvidenceId = hashRecoveryPostActionClosureEvidence({
    tenantId: input.tenantId,
    reconciliationEvidenceId: input.receipt.reconciliationEvidenceId,
    executionEvidenceId: input.receipt.executionEvidenceId,
    verificationEvidenceId: input.receipt.verificationEvidenceId,
    actionId: input.receipt.actionId,
    componentId: input.receipt.componentId,
    correlationId: input.receipt.correlationId,
    fencingToken: input.receipt.fencingToken,
    closureStatus: input.receipt.closureStatus,
    reasonCode: input.receipt.reasonCode,
    reconciliationRecordedAt: input.receipt.reconciliationRecordedAt,
    recordedAt: input.receipt.recordedAt,
  });

  if (expectedEvidenceId !== input.receipt.evidenceId) {
    return { valid: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  if (
    (input.receipt.closureStatus === "closed_verified" && input.receipt.reasonCode !== null)
    || (input.receipt.closureStatus === "closed_rejected" && !isAllowedRejectedReason(input.receipt.reasonCode))
  ) {
    return { valid: false, reasonCode: "INVALID_CLOSURE_STATE" };
  }

  const reconciliationRecordedAtMs = Date.parse(input.receipt.reconciliationRecordedAt);
  const recordedAtMs = Date.parse(input.receipt.recordedAt);
  if (
    !Number.isFinite(reconciliationRecordedAtMs)
    || !Number.isFinite(recordedAtMs)
    || recordedAtMs < reconciliationRecordedAtMs
  ) {
    return { valid: false, reasonCode: "CLOSURE_TIMELINE_INVALID" };
  }

  return { valid: true };
}
