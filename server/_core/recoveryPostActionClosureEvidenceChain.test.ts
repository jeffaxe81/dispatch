import { describe, expect, it } from "vitest";
import type { RecoveryActionRecord } from "./recoveryActionRecord";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import { buildRecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";
import { buildRecoveryPostActionReconciliationReceipt } from "./recoveryPostActionReconciliationAudit";
import { buildRecoveryPostActionClosureReceipt } from "./recoveryPostActionClosureAudit";
import { verifyRecoveryPostActionClosureEvidenceChain } from "./recoveryPostActionClosureEvidenceChain";

const request = {
  tenantId: "tenant-13",
  actionId: "action-13",
  transitionId: "transition-13",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-10T12:00:00.000Z",
  correlationId: "corr-13",
  reservationId: "reservation-13",
  leaseId: "lease-13",
  leaseNamespace: "d011b3-v1" as const,
  ownerId: "owner-13",
  fencingToken: 13,
  authorizationRef: "auth-13",
  deadlineAt: "2026-09-10T12:05:00.000Z",
};

function buildChain(input: {
  verified?: boolean;
  reconciliationRecordedAt?: string;
  closureRecordedAt?: string;
} = {}) {
  const verified = input.verified ?? true;
  const executionEvent = buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-10T12:00:10.000Z",
    finishedAt: "2026-09-10T12:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });

  const verificationReceipt = buildRecoveryPostActionVerificationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verification: verified
      ? { verified: true as const }
      : { verified: false as const, reasonCode: "HEALTH_NOT_HEALTHY" as const },
    healthCheckedAt: "2026-09-10T12:00:21.000Z",
    recordedAt: "2026-09-10T12:00:22.000Z",
  });

  const record: RecoveryActionRecord = {
    actionId: request.actionId,
    tenantId: request.tenantId,
    componentId: request.componentId,
    correlationId: request.correlationId,
    action: request.action,
    state: "completed_success",
    fencingToken: request.fencingToken,
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:20.000Z",
  };

  const reconciliationReceipt = buildRecoveryPostActionReconciliationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verificationReceipt,
    record,
    recordedAt: input.reconciliationRecordedAt ?? "2026-09-10T12:00:23.000Z",
  });

  const closure = buildRecoveryPostActionClosureReceipt({
    tenantId: request.tenantId,
    reconciliationReceipt,
    recordedAt: input.closureRecordedAt ?? "2026-09-10T12:00:24.000Z",
  });

  if (!closure.built) throw new Error("expected closure receipt");

  return { reconciliationReceipt, closureReceipt: closure.receipt };
}

describe("D-011B.13 post-action closure evidence chain", () => {
  it("accepts a valid B11 to B12 verified closure chain", () => {
    const { reconciliationReceipt, closureReceipt } = buildChain();

    expect(verifyRecoveryPostActionClosureEvidenceChain({
      tenantId: request.tenantId,
      reconciliationReceipt,
      closureReceipt,
    })).toEqual({ valid: true });
  });

  it("accepts a valid B11 to B12 rejected closure chain", () => {
    const { reconciliationReceipt, closureReceipt } = buildChain({ verified: false });

    expect(verifyRecoveryPostActionClosureEvidenceChain({
      tenantId: request.tenantId,
      reconciliationReceipt,
      closureReceipt,
    })).toEqual({ valid: true });
  });

  it("rejects two individually valid receipts that belong to different reconciliation evidence", () => {
    const chainA = buildChain();
    const chainB = buildChain({
      reconciliationRecordedAt: "2026-09-10T12:00:23.500Z",
      closureRecordedAt: "2026-09-10T12:00:24.500Z",
    });

    expect(verifyRecoveryPostActionClosureEvidenceChain({
      tenantId: request.tenantId,
      reconciliationReceipt: chainA.reconciliationReceipt,
      closureReceipt: chainB.closureReceipt,
    })).toEqual({ valid: false, reasonCode: "EVIDENCE_LINK_MISMATCH" });
  });

  it("rejects a valid reconciliation paired with a semantically opposite valid closure", () => {
    const verifiedChain = buildChain({ verified: true });
    const rejectedChain = buildChain({ verified: false });

    expect(verifyRecoveryPostActionClosureEvidenceChain({
      tenantId: request.tenantId,
      reconciliationReceipt: verifiedChain.reconciliationReceipt,
      closureReceipt: rejectedChain.closureReceipt,
    })).toEqual({ valid: false, reasonCode: "CLOSURE_SEMANTICS_MISMATCH" });
  });

  it("rejects tampered B11 evidence before evaluating links", () => {
    const { reconciliationReceipt, closureReceipt } = buildChain();
    const tamperedReconciliation = {
      ...reconciliationReceipt,
      actionId: "action-tampered",
    };

    expect(verifyRecoveryPostActionClosureEvidenceChain({
      tenantId: request.tenantId,
      reconciliationReceipt: tamperedReconciliation,
      closureReceipt,
    })).toEqual({ valid: false, reasonCode: "RECONCILIATION_EVIDENCE_MISMATCH" });
  });

  it("rejects tampered B12 evidence before evaluating links", () => {
    const { reconciliationReceipt, closureReceipt } = buildChain();
    const tamperedClosure = {
      ...closureReceipt,
      fencingToken: closureReceipt.fencingToken + 1,
    };

    expect(verifyRecoveryPostActionClosureEvidenceChain({
      tenantId: request.tenantId,
      reconciliationReceipt,
      closureReceipt: tamperedClosure,
    })).toEqual({ valid: false, reasonCode: "CLOSURE_EVIDENCE_MISMATCH" });
  });
});
