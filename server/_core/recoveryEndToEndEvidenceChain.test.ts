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

function buildVerifiedChain() {
  const executionEvent = buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-10T13:00:10.000Z",
    finishedAt: "2026-09-10T13:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });

  const verificationReceipt = buildRecoveryPostActionVerificationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verification: { verified: true as const },
    healthCheckedAt: "2026-09-10T13:00:21.000Z",
    recordedAt: "2026-09-10T13:00:22.000Z",
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
    updatedAt: "2026-09-10T13:00:20.000Z",
  };

  const reconciliationReceipt = buildRecoveryPostActionReconciliationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verificationReceipt,
    record,
    recordedAt: "2026-09-10T13:00:23.000Z",
  });

  const closure = buildRecoveryPostActionClosureReceipt({
    tenantId: request.tenantId,
    reconciliationReceipt,
    recordedAt: "2026-09-10T13:00:24.000Z",
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
  it("accepts a valid execution to closure evidence chain", () => {
    const chain = buildVerifiedChain();

    expect(verifyRecoveryEndToEndEvidenceChain({
      tenantId: request.tenantId,
      ...chain,
    })).toEqual({ valid: true });
  });
});
