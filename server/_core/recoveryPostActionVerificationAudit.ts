import { createHash } from "node:crypto";
import type { RecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import type {
  RecoveryPostActionVerificationReasonCode,
  RecoveryPostActionVerificationResult,
} from "./recoveryPostActionVerification";

export type RecoveryPostActionVerificationReceipt = Readonly<{
  eventType: "recovery.post_action.verification";
  evidenceVersion: "d011b8-v1";
  evidenceId: string;
  executionEvidenceId: string;
  componentId: string;
  verified: boolean;
  reasonCode: RecoveryPostActionVerificationReasonCode | null;
  healthCheckedAt: string;
  recordedAt: string;
}>;

export type RecoveryPostActionVerificationReceiptVerification =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode: "EVIDENCE_MISMATCH" | "INVALID_VERIFICATION_STATE";
    }>;

function hashRecoveryPostActionVerificationEvidence(input: {
  tenantId: string;
  executionEvidenceId: string;
  componentId: string;
  verified: boolean;
  reasonCode: RecoveryPostActionVerificationReasonCode | null;
  healthCheckedAt: string;
  recordedAt: string;
}): string {
  const canonicalEvidence = JSON.stringify([
    "d011b8-v1",
    input.tenantId,
    input.executionEvidenceId,
    input.componentId,
    input.verified,
    input.reasonCode,
    input.healthCheckedAt,
    input.recordedAt,
  ]);

  return createHash("sha256").update(canonicalEvidence, "utf8").digest("hex");
}

export function buildRecoveryPostActionVerificationReceipt(input: {
  tenantId: string;
  executionEvent: RecoveryExecutionAuditEvent;
  verification: RecoveryPostActionVerificationResult;
  healthCheckedAt: string;
  recordedAt: string;
}): RecoveryPostActionVerificationReceipt {
  const reasonCode = input.verification.verified ? null : input.verification.reasonCode;
  const evidenceId = hashRecoveryPostActionVerificationEvidence({
    tenantId: input.tenantId,
    executionEvidenceId: input.executionEvent.evidenceId,
    componentId: input.executionEvent.componentId,
    verified: input.verification.verified,
    reasonCode,
    healthCheckedAt: input.healthCheckedAt,
    recordedAt: input.recordedAt,
  });

  return {
    eventType: "recovery.post_action.verification",
    evidenceVersion: "d011b8-v1",
    evidenceId,
    executionEvidenceId: input.executionEvent.evidenceId,
    componentId: input.executionEvent.componentId,
    verified: input.verification.verified,
    reasonCode,
    healthCheckedAt: input.healthCheckedAt,
    recordedAt: input.recordedAt,
  };
}

export function verifyRecoveryPostActionVerificationReceipt(input: {
  tenantId: string;
  receipt: RecoveryPostActionVerificationReceipt;
}): RecoveryPostActionVerificationReceiptVerification {
  if (
    input.receipt.eventType !== "recovery.post_action.verification"
    || input.receipt.evidenceVersion !== "d011b8-v1"
  ) {
    return { valid: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  const expectedEvidenceId = hashRecoveryPostActionVerificationEvidence({
    tenantId: input.tenantId,
    executionEvidenceId: input.receipt.executionEvidenceId,
    componentId: input.receipt.componentId,
    verified: input.receipt.verified,
    reasonCode: input.receipt.reasonCode,
    healthCheckedAt: input.receipt.healthCheckedAt,
    recordedAt: input.receipt.recordedAt,
  });

  if (expectedEvidenceId !== input.receipt.evidenceId) {
    return { valid: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  if (
    (input.receipt.verified && input.receipt.reasonCode !== null)
    || (!input.receipt.verified && input.receipt.reasonCode === null)
  ) {
    return { valid: false, reasonCode: "INVALID_VERIFICATION_STATE" };
  }

  return { valid: true };
}
