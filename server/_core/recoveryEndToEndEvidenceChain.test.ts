import { describe, expect, it } from "vitest";
import type { RecoveryActionRecord } from "./recoveryActionRecord";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import { buildRecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";
import { buildRecoveryPostActionReconciliationReceipt } from "./recoveryPostActionReconciliationAudit";
import { buildRecoveryPostActionClosureReceipt } from "./recoveryPostActionClosureAudit";
import { verifyRecoveryEndToEndEvidenceChain } from "./recoveryEndToEndEvidenceChain";

const request = {
  tenantId: "tenant-14",
  actionId: "action-14",
  transitionId: "transition-14",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-10T13:00:00.000Z",
  correlationId: "corr-14",
  reservationId: "reservation-14",
  leaseId: "lease-14",
  leaseNamespace: "d011b3-v1" as const,
  ownerId: "owner-14",
  fencingToken: 14,
  authorizationRef: "auth-14",
  deadlineAt: "2026-09-10T13:05:00.000Z",
};

function buildChain(input: { verified?: boolean; shifted?: boolean } = {}) {
  const verified = input.verified ?? true;
  const shifted = input.shifted ?? false;
  const startedAt = shifted ? "2026-09-10T13:00:11.000Z" : "2026-09-10T13:00:10.000Z";
  const finishedAt = shifted ? "2026-09-10T13:00:21.000Z" : "2026-09-10T13:00:20.000Z";
  const healthCheckedAt = shifted ? "2026-09-10T13:00:22.000Z" : "2026-09-10T13:00:21.000Z";
  const verificationRecordedAt = shifted ? "2026-09-10T13:00:23.000Z" : "2026-09-10T13:00:22.000Z";
  const reconciliationRecordedAt = shifted ? "2026-09-10T13:00:24.000Z" : "2026-09-10T13:00:23.000Z";
  const closureRecordedAt = shifted ? "2026-09-10T13:00:25.000Z" : "2026-09-10T13:00:24.000Z";

  const executionEvent = buildRecoveryExecutionAuditEvent({
    request,
    startedAt,
    finishedAt,
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });

  const verificationReceipt = buildRecoveryPostActionVerificationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verification: verified
      ? { verified: true as const }
      : { verified: false as const, reasonCode: "HEALTH_NOT_HEALTHY" as const },
    healthCheckedAt,
    recordedAt: verificationRecordedAt,
  });

  const record: RecoveryActionRecord = {
    actionId: request.actionId,
    tenantId: request.tenantId,
    componentId: request.componentId,
    correlationId: request.correlationId,
    action: request.action,
    state: "completed_success",
    fencingToken: request.fencingToken,
    createdAt: "2026-09-10T13:00:00.000Z",
    updatedAt: finishedAt,
  };

  const reconciliationReceipt = buildRecoveryPostActionReconciliationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verificationReceipt,
    record,
    recordedAt: reconciliationRecordedAt,
  });

  const closure = buildRecoveryPostActionClosureReceipt({
    tenantId: request.tenantId,
    reconciliationReceipt,
    recordedAt: closureRecordedAt,
  });

  if (!closure.built) throw new Error("expected closure receipt");

  return {
    executionEvent,
    verificationReceipt,
    reconciliationReceipt,
    closureReceipt: closure.receipt,
  };
}

describe("D-011B.14 end-to-end recovery evidence chain", () => {
  it("accepts a valid verified execution to closure evidence chain", () => {
    const chain = buildChain();

    expect(verifyRecoveryEndToEndEvidenceChain({
      tenantId: request.tenantId,
      ...chain,
    })).toEqual({ valid: true });
  });

  it("accepts a valid rejected execution to closure evidence chain", () => {
    const chain = buildChain({ verified: false });

    expect(verifyRecoveryEndToEndEvidenceChain({
      tenantId: request.tenantId,
      ...chain,
    })).toEqual({ valid: true });
  });

  it("rejects individually valid subchains whose B8 and B11 evidence do not belong together", () => {
    const chainA = buildChain();
    const chainB = buildChain({ shifted: true });

    expect(verifyRecoveryEndToEndEvidenceChain({
      tenantId: request.tenantId,
      executionEvent: chainA.executionEvent,
      verificationReceipt: chainA.verificationReceipt,
      reconciliationReceipt: chainB.reconciliationReceipt,
      closureReceipt: chainB.closureReceipt,
    })).toEqual({ valid: false, reasonCode: "RECONCILIATION_LINK_MISMATCH" });
  });

  it("rejects tampered B11 evidence through the closure-chain gate", () => {
    const chain = buildChain();
    const tamperedReconciliation = {
      ...chain.reconciliationReceipt,
      actionId: "action-tampered",
    };

    expect(verifyRecoveryEndToEndEvidenceChain({
      tenantId: request.tenantId,
      executionEvent: chain.executionEvent,
      verificationReceipt: chain.verificationReceipt,
      reconciliationReceipt: tamperedReconciliation,
      closureReceipt: chain.closureReceipt,
    })).toEqual({ valid: false, reasonCode: "CLOSURE_CHAIN_INVALID" });
  });

  it("rejects tampered B12 evidence through the closure-chain gate", () => {
    const chain = buildChain();
    const tamperedClosure = {
      ...chain.closureReceipt,
      fencingToken: chain.closureReceipt.fencingToken + 1,
    };

    expect(verifyRecoveryEndToEndEvidenceChain({
      tenantId: request.tenantId,
      executionEvent: chain.executionEvent,
      verificationReceipt: chain.verificationReceipt,
      reconciliationReceipt: chain.reconciliationReceipt,
      closureReceipt: tamperedClosure,
    })).toEqual({ valid: false, reasonCode: "CLOSURE_CHAIN_INVALID" });
  });

  it("rejects the complete chain when verified under the wrong tenant", () => {
    const chain = buildChain();

    expect(verifyRecoveryEndToEndEvidenceChain({
      tenantId: "tenant-wrong",
      ...chain,
    })).toEqual({ valid: false, reasonCode: "EXECUTION_VERIFICATION_CHAIN_INVALID" });
  });
});
