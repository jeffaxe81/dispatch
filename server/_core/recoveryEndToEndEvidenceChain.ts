import type { RecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import {
  verifyRecoveryPostActionEvidenceChain,
} from "./recoveryPostActionEvidenceChain";
import type { RecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";
import type { RecoveryPostActionReconciliationReceipt } from "./recoveryPostActionReconciliationAudit";
import type { RecoveryPostActionClosureReceipt } from "./recoveryPostActionClosureAudit";
import {
  verifyRecoveryPostActionClosureEvidenceChain,
} from "./recoveryPostActionClosureEvidenceChain";

export type RecoveryEndToEndEvidenceChainVerification =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode:
        | "EXECUTION_VERIFICATION_CHAIN_INVALID"
        | "RECONCILIATION_LINK_MISMATCH"
        | "CLOSURE_CHAIN_INVALID";
    }>;

export function verifyRecoveryEndToEndEvidenceChain(input: {
  tenantId: string;
  executionEvent: RecoveryExecutionAuditEvent;
  verificationReceipt: RecoveryPostActionVerificationReceipt;
  reconciliationReceipt: RecoveryPostActionReconciliationReceipt;
  closureReceipt: RecoveryPostActionClosureReceipt;
}): RecoveryEndToEndEvidenceChainVerification {
  const executionVerification = verifyRecoveryPostActionEvidenceChain({
    tenantId: input.tenantId,
    executionEvent: input.executionEvent,
    verificationReceipt: input.verificationReceipt,
  });

  if (!executionVerification.valid) {
    return { valid: false, reasonCode: "EXECUTION_VERIFICATION_CHAIN_INVALID" };
  }

  const closureVerification = verifyRecoveryPostActionClosureEvidenceChain({
    tenantId: input.tenantId,
    reconciliationReceipt: input.reconciliationReceipt,
    closureReceipt: input.closureReceipt,
  });

  if (!closureVerification.valid) {
    return { valid: false, reasonCode: "CLOSURE_CHAIN_INVALID" };
  }

  if (
    input.reconciliationReceipt.executionEvidenceId !== input.executionEvent.evidenceId
    || input.reconciliationReceipt.verificationEvidenceId !== input.verificationReceipt.evidenceId
    || input.reconciliationReceipt.verificationRecordedAt !== input.verificationReceipt.recordedAt
    || input.reconciliationReceipt.actionId !== input.executionEvent.actionId
    || input.reconciliationReceipt.componentId !== input.executionEvent.componentId
    || input.reconciliationReceipt.componentId !== input.verificationReceipt.componentId
    || input.reconciliationReceipt.correlationId !== input.executionEvent.correlationId
    || input.reconciliationReceipt.fencingToken !== input.executionEvent.fencingToken
  ) {
    return { valid: false, reasonCode: "RECONCILIATION_LINK_MISMATCH" };
  }

  return { valid: true };
}
