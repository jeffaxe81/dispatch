import { describe, expect, it } from "vitest";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import { buildRecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";
import { verifyRecoveryPostActionEvidenceChain } from "./recoveryPostActionEvidenceChain";

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

function executionEvent() {
  return buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-10T09:00:10.000Z",
    finishedAt: "2026-09-10T09:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });
}

function verificationReceipt() {
  const event = executionEvent();
  return {
    event,
    receipt: buildRecoveryPostActionVerificationReceipt({
      tenantId: "tenant-7",
      executionEvent: event,
      verification: { verified: true as const },
      healthCheckedAt: "2026-09-10T09:00:21.000Z",
      recordedAt: "2026-09-10T09:00:22.000Z",
    }),
  };
}

describe("D-011B.9 post-action evidence chain verifier", () => {
  it("accepts only when execution evidence and verification receipt are both valid and linked", () => {
    const { event, receipt } = verificationReceipt();
    expect(verifyRecoveryPostActionEvidenceChain({ tenantId: "tenant-7", executionEvent: event, verificationReceipt: receipt }))
      .toEqual({ valid: true });
  });

  it("fails closed when the execution evidence is tampered even if the receipt is otherwise valid", () => {
    const { event, receipt } = verificationReceipt();
    const tamperedExecution = { ...event, componentId: "storage" };
    expect(verifyRecoveryPostActionEvidenceChain({ tenantId: "tenant-7", executionEvent: tamperedExecution, verificationReceipt: receipt }))
      .toEqual({ valid: false, reasonCode: "EXECUTION_EVIDENCE_MISMATCH" });
  });

  it("fails closed when the verification receipt belongs to another tenant", () => {
    const { event } = verificationReceipt();
    const foreignReceipt = buildRecoveryPostActionVerificationReceipt({
      tenantId: "tenant-8",
      executionEvent: event,
      verification: { verified: true as const },
      healthCheckedAt: "2026-09-10T09:00:21.000Z",
      recordedAt: "2026-09-10T09:00:22.000Z",
    });
    expect(verifyRecoveryPostActionEvidenceChain({ tenantId: "tenant-7", executionEvent: event, verificationReceipt: foreignReceipt }))
      .toEqual({ valid: false, reasonCode: "VERIFICATION_EVIDENCE_MISMATCH" });
  });

  it("fails closed when individually valid evidence items are not linked to each other", () => {
    const first = verificationReceipt();
    const secondRequest = { ...request, actionId: "action-22", correlationId: "corr-22", authorizationRef: "auth-22" };
    const secondEvent = buildRecoveryExecutionAuditEvent({
      request: secondRequest,
      startedAt: "2026-09-10T09:01:10.000Z",
      finishedAt: "2026-09-10T09:01:20.000Z",
      status: "executed",
      reasonCode: "SIMULATED_SUCCESS",
    });
    expect(verifyRecoveryPostActionEvidenceChain({ tenantId: "tenant-7", executionEvent: secondEvent, verificationReceipt: first.receipt }))
      .toEqual({ valid: false, reasonCode: "EVIDENCE_LINK_MISMATCH" });
  });
});
