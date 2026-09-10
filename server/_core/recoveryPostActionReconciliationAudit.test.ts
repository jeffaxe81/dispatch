import { describe, expect, it } from "vitest";
import type { RecoveryActionRecord } from "./recoveryActionRecord";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import { buildRecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";
import {
  buildRecoveryPostActionReconciliationReceipt,
  verifyRecoveryPostActionReconciliationReceipt,
} from "./recoveryPostActionReconciliationAudit";

const request = {
  tenantId: "tenant-7",
  actionId: "action-31",
  transitionId: "transition-31",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-10T10:00:00.000Z",
  correlationId: "corr-31",
  reservationId: "reservation-31",
  leaseId: "lease-31",
  leaseNamespace: "d011b3-v1" as const,
  ownerId: "owner-1",
  fencingToken: 5,
  authorizationRef: "auth-31",
  deadlineAt: "2026-09-10T10:05:00.000Z",
};

function validInputs() {
  const executionEvent = buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-10T10:00:10.000Z",
    finishedAt: "2026-09-10T10:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });
  const verificationReceipt = buildRecoveryPostActionVerificationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verification: { verified: true as const },
    healthCheckedAt: "2026-09-10T10:00:21.000Z",
    recordedAt: "2026-09-10T10:00:22.000Z",
  });
  const record: RecoveryActionRecord = {
    actionId: request.actionId,
    tenantId: request.tenantId,
    componentId: request.componentId,
    correlationId: request.correlationId,
    action: request.action,
    state: "completed_success",
    fencingToken: request.fencingToken,
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:20.000Z",
  };
  return { executionEvent, verificationReceipt, record };
}

describe("D-011B.11 post-action reconciliation audit receipt", () => {
  it("builds and verifies an eligible receipt from the exact B10 evidence-to-ledger binding", () => {
    const { executionEvent, verificationReceipt, record } = validInputs();

    const receipt = buildRecoveryPostActionReconciliationReceipt({
      tenantId: request.tenantId,
      executionEvent,
      verificationReceipt,
      record,
      recordedAt: "2026-09-10T10:00:23.000Z",
    });

    expect(receipt).toMatchObject({
      eventType: "recovery.post_action.reconciliation",
      evidenceVersion: "d011b11-v1",
      executionEvidenceId: executionEvent.evidenceId,
      verificationEvidenceId: verificationReceipt.evidenceId,
      actionId: request.actionId,
      componentId: request.componentId,
      correlationId: request.correlationId,
      fencingToken: request.fencingToken,
      ledgerState: "completed_success",
      eligible: true,
      reasonCode: null,
      recordedAt: "2026-09-10T10:00:23.000Z",
    });
    expect(verifyRecoveryPostActionReconciliationReceipt({
      tenantId: request.tenantId,
      receipt,
    })).toEqual({ valid: true });
  });
});
