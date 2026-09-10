import {
  verifyRecoveryExecutionAuditEvidence,
  type RecoveryExecutionAuditEvent,
} from "./recoveryExecutionAudit";
import {
  verifyRecoveryPostActionVerificationReceipt,
  type RecoveryPostActionVerificationReceipt,
} from "./recoveryPostActionVerificationAudit";

export type RecoveryPostActionEvidenceChainVerification =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode:
        | "EXECUTION_EVIDENCE_MISMATCH"
        | "VERIFICATION_EVIDENCE_MISMATCH"
        | "VERIFICATION_STATE_INVALID"
        | "EVIDENCE_LINK_MISMATCH";
    }>;

export function verifyRecoveryPostActionEvidenceChain(input: {
  tenantId: string;
  executionEvent: RecoveryExecutionAuditEvent;
  verificationReceipt: RecoveryPostActionVerificationReceipt;
}): RecoveryPostActionEvidenceChainVerification {
  const executionVerification = verifyRecoveryExecutionAuditEvidence({
    tenantId: input.tenantId,
    event: input.executionEvent,
  });

  if (!executionVerification.valid) {
    return { valid: false, reasonCode: "EXECUTION_EVIDENCE_MISMATCH" };
  }

  const receiptVerification = verifyRecoveryPostActionVerificationReceipt({
    tenantId: input.tenantId,
    receipt: input.verificationReceipt,
  });

  if (!receiptVerification.valid) {
    return {
      valid: false,
      reasonCode: receiptVerification.reasonCode === "INVALID_VERIFICATION_STATE"
        ? "VERIFICATION_STATE_INVALID"
        : "VERIFICATION_EVIDENCE_MISMATCH",
    };
  }

  if (
    input.verificationReceipt.executionEvidenceId !== input.executionEvent.evidenceId
    || input.verificationReceipt.componentId !== input.executionEvent.componentId
  ) {
    return { valid: false, reasonCode: "EVIDENCE_LINK_MISMATCH" };
  }

  return { valid: true };
}
