import { describe, expect, it } from "vitest";
import type { HealthSnapshot } from "./healthRegistry";
import { buildRecoveryExecutionAuditEvent } from "./recoveryExecutionAudit";
import { verifyRecoveryPostActionHealth } from "./recoveryPostActionVerification";

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

function event() {
  return buildRecoveryExecutionAuditEvent({
    request,
    startedAt: "2026-09-09T20:00:10.000Z",
    finishedAt: "2026-09-09T20:00:20.000Z",
    status: "executed",
    reasonCode: "SIMULATED_SUCCESS",
  });
}

function health(state: "healthy" | "degraded" | "unhealthy" | "unknown", checkedAt = "2026-09-09T20:00:21.000Z"): HealthSnapshot {
  return {
    status: state === "healthy" ? "ready" : "degraded",
    checkedAt,
    components: [{
      id: "database",
      name: "Database",
      state,
      criticality: "critical",
      blocksReadiness: true,
      checkedAt,
      durationMs: 4,
    }],
  };
}

describe("D-011B.7 post-action health verification", () => {
  it("accepts only intact successful evidence followed by healthy component evidence", () => {
    expect(verifyRecoveryPostActionHealth({ tenantId: "tenant-7", event: event(), health: health("healthy") }))
      .toEqual({ verified: true });
  });

  it("fails closed when the audit evidence was tampered", () => {
    const tampered = { ...event(), evidenceId: "0".repeat(64) };
    expect(verifyRecoveryPostActionHealth({ tenantId: "tenant-7", event: tampered, health: health("healthy") }))
      .toEqual({ verified: false, reasonCode: "EVIDENCE_MISMATCH" });
  });

  it("fails closed when execution did not finish as simulated success", () => {
    const failed = buildRecoveryExecutionAuditEvent({
      request,
      startedAt: "2026-09-09T20:00:10.000Z",
      finishedAt: "2026-09-09T20:00:20.000Z",
      status: "failed",
      reasonCode: "SIMULATED_FAILURE",
    });
    expect(verifyRecoveryPostActionHealth({ tenantId: "tenant-7", event: failed, health: health("healthy") }))
      .toEqual({ verified: false, reasonCode: "EXECUTION_NOT_SUCCESSFUL" });
  });

  it("fails closed when health evidence predates execution completion", () => {
    expect(verifyRecoveryPostActionHealth({
      tenantId: "tenant-7",
      event: event(),
      health: health("healthy", "2026-09-09T20:00:19.000Z"),
    })).toEqual({ verified: false, reasonCode: "HEALTH_EVIDENCE_NOT_POST_ACTION" });
  });

  it("fails closed when target component is missing or not healthy", () => {
    const missing: HealthSnapshot = { status: "ready", checkedAt: "2026-09-09T20:00:21.000Z", components: [] };
    expect(verifyRecoveryPostActionHealth({ tenantId: "tenant-7", event: event(), health: missing }))
      .toEqual({ verified: false, reasonCode: "HEALTH_COMPONENT_MISSING" });
    expect(verifyRecoveryPostActionHealth({ tenantId: "tenant-7", event: event(), health: health("degraded") }))
      .toEqual({ verified: false, reasonCode: "HEALTH_NOT_HEALTHY" });
  });
});
