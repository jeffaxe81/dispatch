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

  return { valid: true };
}
