import { createHash } from "node:crypto";
import type {
  RecoveryActionRecord,
  RecoveryActionRecordState,
} from "./recoveryActionRecord";
import type { RecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import {
  verifyRecoveryPostActionLedgerBinding,
  type RecoveryPostActionLedgerBindingDecision,
} from "./recoveryPostActionLedgerBinding";
import type { RecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";

type RecoveryPostActionReconciliationReasonCode = Extract<
  RecoveryPostActionLedgerBindingDecision,
  { eligible: false }
>["reasonCode"];

export type RecoveryPostActionReconciliationReceipt = Readonly<{
  eventType: "recovery.post_action.reconciliation";
  evidenceVersion: "d011b11-v1";
  evidenceId: string;
  executionEvidenceId: string;
  verificationEvidenceId: string;
  verificationRecordedAt: string;
  actionId: string;
  componentId: string;
  correlationId: string;
  fencingToken: number;
  ledgerState: RecoveryActionRecordState;
  eligible: boolean;
  reasonCode: RecoveryPostActionReconciliationReasonCode | null;
  recordedAt: string;
}>;

export type RecoveryPostActionReconciliationReceiptVerification =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode:
        | "EVIDENCE_MISMATCH"
        | "INVALID_RECONCILIATION_STATE"
        | "RECONCILIATION_TIMELINE_INVALID";
    }>;

function hashRecoveryPostActionReconciliationEvidence(input: {
  tenantId: string;
  executionEvidenceId: string;
  verificationEvidenceId: string;
  verificationRecordedAt: string;
  actionId: string;
  componentId: string;
  correlationId: string;
  fencingToken: number;
  ledgerState: RecoveryActionRecordState;
  eligible: boolean;
  reasonCode: RecoveryPostActionReconciliationReasonCode | null;
  recordedAt: string;
}): string {
  const canonicalEvidence = JSON.stringify([
    "d011b11-v1",
    input.tenantId,
    input.executionEvidenceId,
    input.verificationEvidenceId,
    input.verificationRecordedAt,
    input.actionId,
    input.componentId,
    input.correlationId,
    input.fencingToken,
    input.ledgerState,
    input.eligible,
    input.reasonCode,
    input.recordedAt,
  ]);

  return createHash("sha256").update(canonicalEvidence, "utf8").digest("hex");
}

export function buildRecoveryPostActionReconciliationReceipt(input: {
  tenantId: string;
  executionEvent: RecoveryExecutionAuditEvent;
  verificationReceipt: RecoveryPostActionVerificationReceipt;
  record: RecoveryActionRecord;
  recordedAt: string;
}): RecoveryPostActionReconciliationReceipt {
  const decision = verifyRecoveryPostActionLedgerBinding({
    tenantId: input.tenantId,
    executionEvent: input.executionEvent,
    verificationReceipt: input.verificationReceipt,
    record: input.record,
  });
  const reasonCode = decision.eligible ? null : decision.reasonCode;

  const evidenceId = hashRecoveryPostActionReconciliationEvidence({
    tenantId: input.tenantId,
    executionEvidenceId: input.executionEvent.evidenceId,
    verificationEvidenceId: input.verificationReceipt.evidenceId,
    verificationRecordedAt: input.verificationReceipt.recordedAt,
    actionId: input.executionEvent.actionId,
    componentId: input.executionEvent.componentId,
    correlationId: input.executionEvent.correlationId,
    fencingToken: input.executionEvent.fencingToken,
    ledgerState: input.record.state,
    eligible: decision.eligible,
    reasonCode,
    recordedAt: input.recordedAt,
  });

  return {
    eventType: "recovery.post_action.reconciliation",
    evidenceVersion: "d011b11-v1",
    evidenceId,
    executionEvidenceId: input.executionEvent.evidenceId,
    verificationEvidenceId: input.verificationReceipt.evidenceId,
    verificationRecordedAt: input.verificationReceipt.recordedAt,
    actionId: input.executionEvent.actionId,
    componentId: input.executionEvent.componentId,
    correlationId: input.executionEvent.correlationId,
    fencingToken: input.executionEvent.fencingToken,
    ledgerState: input.record.state,
    eligible: decision.eligible,
    reasonCode,
    recordedAt: input.recordedAt,
  };
}

export function verifyRecoveryPostActionReconciliationReceipt(input: {
  tenantId: string;
  receipt: RecoveryPostActionReconciliationReceipt;
}): RecoveryPostActionReconciliationReceiptVerification {
  if (
    input.receipt.eventType !== "recovery.post_action.reconciliation"
    || input.receipt.evidenceVersion !== "d011b11-v1"
  ) {
    return { valid: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  const expectedEvidenceId = hashRecoveryPostActionReconciliationEvidence({
    tenantId: input.tenantId,
    executionEvidenceId: input.receipt.executionEvidenceId,
    verificationEvidenceId: input.receipt.verificationEvidenceId,
    verificationRecordedAt: input.receipt.verificationRecordedAt,
    actionId: input.receipt.actionId,
    componentId: input.receipt.componentId,
    correlationId: input.receipt.correlationId,
    fencingToken: input.receipt.fencingToken,
    ledgerState: input.receipt.ledgerState,
    eligible: input.receipt.eligible,
    reasonCode: input.receipt.reasonCode,
    recordedAt: input.receipt.recordedAt,
  });

  if (expectedEvidenceId !== input.receipt.evidenceId) {
    return { valid: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  if (
    (input.receipt.eligible && input.receipt.reasonCode !== null)
    || (!input.receipt.eligible && input.receipt.reasonCode === null)
  ) {
    return { valid: false, reasonCode: "INVALID_RECONCILIATION_STATE" };
  }

  const verificationRecordedAtMs = Date.parse(input.receipt.verificationRecordedAt);
  const recordedAtMs = Date.parse(input.receipt.recordedAt);
  if (
    !Number.isFinite(verificationRecordedAtMs)
    || !Number.isFinite(recordedAtMs)
    || recordedAtMs < verificationRecordedAtMs
  ) {
    return { valid: false, reasonCode: "RECONCILIATION_TIMELINE_INVALID" };
  }

  return { valid: true };
}
