import { describe, expect, it } from "vitest";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import {
  buildRecoveryPostActionVerificationReceipt,
  verifyRecoveryPostActionVerificationReceipt,
} from "./recoveryPostActionVerificationAudit";

const request = {
  tenantId: "tenant-7",
  actionId: "action-21",
  transitionId: "transition-21",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-09T20:00:00.000Z",
  correlationId: "corr-21",
  reservationId: "reservation-21",
  leaseId: "lease-21",
  leaseNamespace: "d011b3-v1" as const,
  ownerId: "owner-1",
  fencingToken: 3,
  authorizationRef: "auth-21",
  deadlineAt: "2026-09-09T20:05:00.000Z",
};

function executionEvent() {
  return buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-09T20:00:10.000Z",
    finishedAt: "2026-09-09T20:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });
}

describe("D-011B.8 post-action verification audit receipt", () => {
  it("builds a deterministic receipt tied to tenant and execution evidence", () => {
    const input = {
      tenantId: "tenant-7",
      executionEvent: executionEvent(),
      verification: { verified: true as const },
      healthCheckedAt: "2026-09-09T20:00:21.000Z",
      recordedAt: "2026-09-09T20:00:22.000Z",
    };

    const first = buildRecoveryPostActionVerificationReceipt(input);
    const second = buildRecoveryPostActionVerificationReceipt(input);

    expect(first).toEqual(second);
    expect(first).toEqual(expect.objectContaining({
      eventType: "recovery.post_action.verification",
      evidenceVersion: "d011b8-v1",
      executionEvidenceId: input.executionEvent.evidenceId,
      componentId: "database",
      verified: true,
      reasonCode: null,
      healthCheckedAt: input.healthCheckedAt,
      recordedAt: input.recordedAt,
    }));
    expect(first.evidenceId).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toHaveProperty("tenantId");
  });

  it("changes evidence when tenant changes and verifies only in the matching tenant", () => {
    const common = {
      executionEvent: executionEvent(),
      verification: { verified: true as const },
      healthCheckedAt: "2026-09-09T20:00:21.000Z",
      recordedAt: "2026-09-09T20:00:22.000Z",
    };
    const tenant7 = buildRecoveryPostActionVerificationReceipt({ tenantId: "tenant-7", ...common });
    const tenant8 = buildRecoveryPostActionVerificationReceipt({ tenantId: "tenant-8", ...common });

    expect(tenant7.evidenceId).not.toBe(tenant8.evidenceId);
    expect(verifyRecoveryPostActionVerificationReceipt({ tenantId: "tenant-7", receipt: tenant7 })).toEqual({ valid: true });
    expect(verifyRecoveryPostActionVerificationReceipt({ tenantId: "tenant-8", receipt: tenant7 })).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });

  it("records failed verification without promoting it to success", () => {
    const receipt = buildRecoveryPostActionVerificationReceipt({
      tenantId: "tenant-7",
      executionEvent: executionEvent(),
      verification: { verified: false as const, reasonCode: "HEALTH_NOT_HEALTHY" as const },
      healthCheckedAt: "2026-09-09T20:00:21.000Z",
      recordedAt: "2026-09-09T20:00:22.000Z",
    });

    expect(receipt.verified).toBe(false);
    expect(receipt.reasonCode).toBe("HEALTH_NOT_HEALTHY");
  });

  it("fails closed when receipt content is tampered", () => {
    const receipt = buildRecoveryPostActionVerificationReceipt({
      tenantId: "tenant-7",
      executionEvent: executionEvent(),
      verification: { verified: true as const },
      healthCheckedAt: "2026-09-09T20:00:21.000Z",
      recordedAt: "2026-09-09T20:00:22.000Z",
    });
    const tampered = { ...receipt, componentId: "storage" };

    expect(verifyRecoveryPostActionVerificationReceipt({ tenantId: "tenant-7", receipt: tampered }))
      .toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });
});
