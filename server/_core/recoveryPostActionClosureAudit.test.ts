import { describe, expect, it } from "vitest";
import type { RecoveryActionRecord } from "./recoveryActionRecord";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import { buildRecoveryPostActionVerificationReceipt } from "./recoveryPostActionVerificationAudit";
import { buildRecoveryPostActionReconciliationReceipt } from "./recoveryPostActionReconciliationAudit";
import {
  buildRecoveryPostActionClosureReceipt,
  verifyRecoveryPostActionClosureReceipt,
} from "./recoveryPostActionClosureAudit";

const request = {
  tenantId: "tenant-7",
  actionId: "action-32",
  transitionId: "transition-32",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-10T11:00:00.000Z",
  correlationId: "corr-32",
  reservationId: "reservation-32",
  leaseId: "lease-32",
  leaseNamespace: "d011b3-v1" as const,
  ownerId: "owner-1",
  fencingToken: 6,
  authorizationRef: "auth-32",
  deadlineAt: "2026-09-10T11:05:00.000Z",
};

function reconciliationInputs(verified: boolean) {
  const executionEvent = buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-10T11:00:10.000Z",
    finishedAt: "2026-09-10T11:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });

  const verificationReceipt = buildRecoveryPostActionVerificationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verification: verified
      ? { verified: true as const }
      : { verified: false as const, reasonCode: "HEALTH_NOT_HEALTHY" as const },
    healthCheckedAt: "2026-09-10T11:00:21.000Z",
    recordedAt: "2026-09-10T11:00:22.000Z",
  });

  const record: RecoveryActionRecord = {
    actionId: request.actionId,
    tenantId: request.tenantId,
    componentId: request.componentId,
    correlationId: request.correlationId,
    action: request.action,
    state: "completed_success",
    fencingToken: request.fencingToken,
    createdAt: "2026-09-10T11:00:00.000Z",
    updatedAt: "2026-09-10T11:00:20.000Z",
  };

  return buildRecoveryPostActionReconciliationReceipt({
    tenantId: request.tenantId,
    executionEvent,
    verificationReceipt,
    record,
    recordedAt: "2026-09-10T11:00:23.000Z",
  });
}

describe("D-011B.12 post-action closure audit", () => {
  it("builds and verifies closed_verified only from a valid eligible B11 receipt", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });

    expect(result.built).toBe(true);
    if (!result.built) throw new Error("expected closure receipt");

    expect(result.receipt).toMatchObject({
      eventType: "recovery.post_action.closure",
      evidenceVersion: "d011b12-v1",
      reconciliationEvidenceId: reconciliationReceipt.evidenceId,
      executionEvidenceId: reconciliationReceipt.executionEvidenceId,
      verificationEvidenceId: reconciliationReceipt.verificationEvidenceId,
      actionId: request.actionId,
      componentId: request.componentId,
      correlationId: request.correlationId,
      fencingToken: request.fencingToken,
      closureStatus: "closed_verified",
      reasonCode: null,
      reconciliationRecordedAt: reconciliationReceipt.recordedAt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: result.receipt,
    })).toEqual({ valid: true });
  });

  it("builds closed_rejected and preserves the sanitized B11 reason", () => {
    const reconciliationReceipt = reconciliationInputs(false);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });

    expect(result.built).toBe(true);
    if (!result.built) throw new Error("expected closure receipt");

    expect(result.receipt.closureStatus).toBe("closed_rejected");
    expect(result.receipt.reasonCode).toBe("POST_ACTION_NOT_VERIFIED");
  });

  it("does not build any B12 receipt from a tampered B11 receipt", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const tampered = {
      ...reconciliationReceipt,
      actionId: "action-tampered",
    };

    expect(buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt: tampered,
      recordedAt: "2026-09-10T11:00:24.000Z",
    })).toEqual({
      built: false,
      reasonCode: "RECONCILIATION_EVIDENCE_INVALID",
    });
  });

  it("does not build any B12 receipt when the B11 tenant context is wrong", () => {
    const reconciliationReceipt = reconciliationInputs(true);

    expect(buildRecoveryPostActionClosureReceipt({
      tenantId: "tenant-other",
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    })).toEqual({
      built: false,
      reasonCode: "RECONCILIATION_EVIDENCE_INVALID",
    });
  });

  it("rejects an existing B12 receipt under the wrong tenant context", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });
    if (!result.built) throw new Error("expected closure receipt");

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: "tenant-other",
      receipt: result.receipt,
    })).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });

  it("rejects tampering of a protected identity field", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });
    if (!result.built) throw new Error("expected closure receipt");

    const tampered = {
      ...result.receipt,
      fencingToken: result.receipt.fencingToken + 1,
    };

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: tampered,
    })).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });

  it("rejects a closure recorded before its reconciliation", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:22.999Z",
    });
    if (!result.built) throw new Error("expected closure receipt");

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: result.receipt,
    })).toEqual({ valid: false, reasonCode: "CLOSURE_TIMELINE_INVALID" });
  });

  it("rejects invalid closure timestamps", () => {
    const reconciliationReceipt = reconciliationInputs(true);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "not-a-timestamp",
    });
    if (!result.built) throw new Error("expected closure receipt");

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: result.receipt,
    })).toEqual({ valid: false, reasonCode: "CLOSURE_TIMELINE_INVALID" });
  });

  it("rejects an impossible verified/reasonCode combination", () => {
    const reconciliationReceipt = reconciliationInputs(false);
    const result = buildRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      reconciliationReceipt,
      recordedAt: "2026-09-10T11:00:24.000Z",
    });
    if (!result.built) throw new Error("expected closure receipt");

    const impossible = {
      ...result.receipt,
      closureStatus: "closed_verified" as const,
    };

    expect(verifyRecoveryPostActionClosureReceipt({
      tenantId: request.tenantId,
      receipt: impossible,
    })).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });
});
