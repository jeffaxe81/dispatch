import type { RecoveryActionRecord } from "./recoveryActionRecord";
import type { RecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import {
  verifyRecoveryPostActionEvidenceChain,
} from "./recoveryPostActionEvidenceChain";
import type { RecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";

export type RecoveryPostActionLedgerBindingDecision =
  | Readonly<{ eligible: true }>
  | Readonly<{
      eligible: false;
      reasonCode:
        | "EVIDENCE_CHAIN_INVALID"
        | "EXECUTION_OUTCOME_INVALID"
        | "POST_ACTION_NOT_VERIFIED"
        | "LEDGER_IDENTITY_MISMATCH"
        | "LEDGER_FENCING_MISMATCH"
        | "LEDGER_STATE_INVALID";
    }>;

export function verifyRecoveryPostActionLedgerBinding(input: {
  tenantId: string;
  executionEvent: RecoveryExecutionAuditEvent;
  verificationReceipt: RecoveryPostActionVerificationReceipt;
  record: RecoveryActionRecord;
}): RecoveryPostActionLedgerBindingDecision {
  const chain = verifyRecoveryPostActionEvidenceChain({
    tenantId: input.tenantId,
    executionEvent: input.executionEvent,
    verificationReceipt: input.verificationReceipt,
  });

  if (!chain.valid) {
    return { eligible: false, reasonCode: "EVIDENCE_CHAIN_INVALID" };
  }

  if (
    input.executionEvent.status !== "executed"
    || input.executionEvent.reasonCode !== "SIMULATED_SUCCESS"
  ) {
    return { eligible: false, reasonCode: "EXECUTION_OUTCOME_INVALID" };
  }

  if (!input.verificationReceipt.verified) {
    return { eligible: false, reasonCode: "POST_ACTION_NOT_VERIFIED" };
  }

  if (
    input.record.tenantId !== input.tenantId
    || input.record.actionId !== input.executionEvent.actionId
    || input.record.componentId !== input.executionEvent.componentId
    || input.record.correlationId !== input.executionEvent.correlationId
    || input.record.action !== input.executionEvent.action
  ) {
    return { eligible: false, reasonCode: "LEDGER_IDENTITY_MISMATCH" };
  }

  if (input.record.fencingToken !== input.executionEvent.fencingToken) {
    return { eligible: false, reasonCode: "LEDGER_FENCING_MISMATCH" };
  }

  if (input.record.state !== "completed_success") {
    return { eligible: false, reasonCode: "LEDGER_STATE_INVALID" };
  }

  return { eligible: true };
}
