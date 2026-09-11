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

function buildChain() {
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
    verification: { verified: true },
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
    recordedAt: "2026-09-10T12:00:23.000Z",
  });

  const closure = buildRecoveryPostActionClosureReceipt({
    tenantId: request.tenantId,
    reconciliationReceipt,
    recordedAt: "2026-09-10T12:00:24.000Z",
  });

  if (!closure.built) throw new Error("expected closure receipt");

  return { reconciliationReceipt, closureReceipt: closure.receipt };
}

describe("D-011B.13 post-action closure evidence chain", () => {
  it("accepts a valid B11 to B12 closure chain", () => {
    const { reconciliationReceipt, closureReceipt } = buildChain();

    expect(verifyRecoveryPostActionClosureEvidenceChain({
      tenantId: request.tenantId,
      reconciliationReceipt,
      closureReceipt,
    })).toEqual({ valid: true });
  });
});
