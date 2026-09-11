import {
  verifyRecoveryPostActionReconciliationReceipt,
  type RecoveryPostActionReconciliationReceipt,
} from "./recoveryPostActionReconciliationAudit";
import {
  verifyRecoveryPostActionClosureReceipt,
  type RecoveryPostActionClosureReceipt,
} from "./recoveryPostActionClosureAudit";

export type RecoveryPostActionClosureEvidenceChainVerification =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode:
        | "RECONCILIATION_EVIDENCE_MISMATCH"
        | "CLOSURE_EVIDENCE_MISMATCH"
        | "EVIDENCE_LINK_MISMATCH"
        | "CLOSURE_SEMANTICS_MISMATCH"
        | "EVIDENCE_TIMELINE_INVALID";
    }>;

export function verifyRecoveryPostActionClosureEvidenceChain(input: {
  tenantId: string;
  reconciliationReceipt: RecoveryPostActionReconciliationReceipt;
  closureReceipt: RecoveryPostActionClosureReceipt;
}): RecoveryPostActionClosureEvidenceChainVerification {
  const reconciliation = verifyRecoveryPostActionReconciliationReceipt({
    tenantId: input.tenantId,
    receipt: input.reconciliationReceipt,
  });

  if (!reconciliation.valid) {
    return { valid: false, reasonCode: "RECONCILIATION_EVIDENCE_MISMATCH" };
  }

  const closure = verifyRecoveryPostActionClosureReceipt({
    tenantId: input.tenantId,
    receipt: input.closureReceipt,
  });

  if (!closure.valid) {
    return { valid: false, reasonCode: "CLOSURE_EVIDENCE_MISMATCH" };
  }

  const expectedClosureStatus = input.reconciliationReceipt.eligible
    ? "closed_verified"
    : "closed_rejected";
  const expectedReasonCode = input.reconciliationReceipt.eligible
    ? null
    : input.reconciliationReceipt.reasonCode;

  if (
    input.closureReceipt.closureStatus !== expectedClosureStatus
    || input.closureReceipt.reasonCode !== expectedReasonCode
  ) {
    return { valid: false, reasonCode: "CLOSURE_SEMANTICS_MISMATCH" };
  }

  if (
    input.closureReceipt.reconciliationEvidenceId !== input.reconciliationReceipt.evidenceId
    || input.closureReceipt.executionEvidenceId !== input.reconciliationReceipt.executionEvidenceId
    || input.closureReceipt.verificationEvidenceId !== input.reconciliationReceipt.verificationEvidenceId
    || input.closureReceipt.actionId !== input.reconciliationReceipt.actionId
    || input.closureReceipt.componentId !== input.reconciliationReceipt.componentId
    || input.closureReceipt.correlationId !== input.reconciliationReceipt.correlationId
    || input.closureReceipt.fencingToken !== input.reconciliationReceipt.fencingToken
    || input.closureReceipt.reconciliationRecordedAt !== input.reconciliationReceipt.recordedAt
  ) {
    return { valid: false, reasonCode: "EVIDENCE_LINK_MISMATCH" };
  }

  const reconciliationRecordedAtMs = Date.parse(input.reconciliationReceipt.recordedAt);
  const closureRecordedAtMs = Date.parse(input.closureReceipt.recordedAt);
  if (
    !Number.isFinite(reconciliationRecordedAtMs)
    || !Number.isFinite(closureRecordedAtMs)
    || closureRecordedAtMs < reconciliationRecordedAtMs
  ) {
    return { valid: false, reasonCode: "EVIDENCE_TIMELINE_INVALID" };
  }

  return { valid: true };
}
