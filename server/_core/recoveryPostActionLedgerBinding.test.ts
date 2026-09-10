import { describe, expect, it } from "vitest";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import { buildRecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";
import { verifyRecoveryPostActionLedgerBinding } from "./recoveryPostActionLedgerBinding";
import type { RecoveryActionRecord } from "./recoveryActionRecord";

const request = {
  tenantId: "tenant-7",
  actionId: "action-21",
  transitionId: "transition-21",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-10T09:00:00.000Z",
  correlationId: "corr-21",
  reservationId: "reservation-21",
  leaseId: "lease-21",
  leaseNamespace: "d011b3-v1" as const,
  ownerId: "owner-1",
  fencingToken: 3,
  authorizationRef: "auth-21",
  deadlineAt: "2026-09-10T09:05:00.000Z",
};

function evidenceChain() {
  const executionEvent = buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-10T09:00:10.000Z",
    finishedAt: "2026-09-10T09:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });
  const verificationReceipt = buildRecoveryPostActionVerificationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verification: { verified: true as const },
    healthCheckedAt: "2026-09-10T09:00:21.000Z",
    recordedAt: "2026-09-10T09:00:22.000Z",
  });
  return { executionEvent, verificationReceipt };
}

function ledgerRecord(overrides: Partial<RecoveryActionRecord> = {}): RecoveryActionRecord {
  return {
    actionId: request.actionId,
    tenantId: request.tenantId,
    componentId: request.componentId,
    correlationId: request.correlationId,
    action: request.action,
    state: "completed_success",
    fencingToken: request.fencingToken,
    createdAt: "2026-09-10T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:20.000Z",
    ...overrides,
  };
}

describe("D-011B.10 evidence-to-ledger binding gate", () => {
  it("is eligible only when valid post-action evidence matches the exact successful ledger record", () => {
    const { executionEvent, verificationReceipt } = evidenceChain();

    expect(verifyRecoveryPostActionLedgerBinding({
      tenantId: request.tenantId,
      executionEvent,
      verificationReceipt,
      record: ledgerRecord(),
    })).toEqual({ eligible: true });
  });

  it("fails closed when the evidence chain is invalid", () => {
    const { executionEvent, verificationReceipt } = evidenceChain();

    expect(verifyRecoveryPostActionLedgerBinding({
      tenantId: request.tenantId,
      executionEvent: { ...executionEvent, componentId: "storage" },
      verificationReceipt,
      record: ledgerRecord(),
    })).toEqual({ eligible: false, reasonCode: "EVIDENCE_CHAIN_INVALID" });
  });

  it("fails closed when tenant or action identity does not match the ledger record", () => {
    const { executionEvent, verificationReceipt } = evidenceChain();

    expect(verifyRecoveryPostActionLedgerBinding({
      tenantId: request.tenantId,
      executionEvent,
      verificationReceipt,
      record: ledgerRecord({ tenantId: "tenant-8" }),
    })).toEqual({ eligible: false, reasonCode: "LEDGER_IDENTITY_MISMATCH" });

    expect(verifyRecoveryPostActionLedgerBinding({
      tenantId: request.tenantId,
      executionEvent,
      verificationReceipt,
      record: ledgerRecord({ actionId: "action-22" }),
    })).toEqual({ eligible: false, reasonCode: "LEDGER_IDENTITY_MISMATCH" });
  });

  it("fails closed when component, correlation or action differs from the ledger record", () => {
    const { executionEvent, verificationReceipt } = evidenceChain();

    for (const record of [
      ledgerRecord({ componentId: "storage" }),
      ledgerRecord({ correlationId: "corr-other" }),
      ledgerRecord({ action: "restart_component" }),
    ]) {
      expect(verifyRecoveryPostActionLedgerBinding({
        tenantId: request.tenantId,
        executionEvent,
        verificationReceipt,
        record,
      })).toEqual({ eligible: false, reasonCode: "LEDGER_IDENTITY_MISMATCH" });
    }
  });

  it("fails closed when the fencing token differs", () => {
    const { executionEvent, verificationReceipt } = evidenceChain();

    expect(verifyRecoveryPostActionLedgerBinding({
      tenantId: request.tenantId,
      executionEvent,
      verificationReceipt,
      record: ledgerRecord({ fencingToken: request.fencingToken + 1 }),
    })).toEqual({ eligible: false, reasonCode: "LEDGER_FENCING_MISMATCH" });
  });

  it("fails closed unless the ledger is in completed_success", () => {
    const { executionEvent, verificationReceipt } = evidenceChain();

    for (const state of ["reserved", "executing", "completed_failure", "verification_failed", "unknown_outcome"] as const) {
      expect(verifyRecoveryPostActionLedgerBinding({
        tenantId: request.tenantId,
        executionEvent,
        verificationReceipt,
        record: ledgerRecord({ state }),
      })).toEqual({ eligible: false, reasonCode: "LEDGER_STATE_INVALID" });
    }
  });
});
