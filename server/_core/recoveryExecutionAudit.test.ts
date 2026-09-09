import { describe, expect, it } from "vitest";
import type { RecoveryExecutionRequest } from "./recoveryExecution";
import {
  buildRecoveryExecutionAuditEvent,
  sanitizeRecoveryExecutionFailure,
} from "./recoveryExecutionAudit";

const request: RecoveryExecutionRequest = {
  tenantId: "tenant-7",
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component",
  requestedAt: "2026-09-08T12:00:00.000Z",
  correlationId: "decision-1",
  reservationId: "action:decision-1",
  leaseId: "lease-1",
  leaseNamespace: "d011b3-v1",
  ownerId: "node-a",
  fencingToken: 7,
  authorizationRef: "auth-1",
  deadlineAt: "2026-09-08T12:01:00.000Z",
};

describe("D-011B.4 sanitized recovery execution audit", () => {
  it("builds an allowlisted audit event with stable execution identity and outcome", () => {
    const event = buildRecoveryExecutionAuditEvent({
      request,
      startedAt: "2026-09-08T12:00:02.000Z",
      finishedAt: "2026-09-08T12:00:03.000Z",
      status: "executed",
      reasonCode: "SIMULATED_SUCCESS",
    });

    expect(event).toEqual({
      eventType: "recovery.execution.finished",
      evidenceVersion: "d011b5-v1",
      evidenceId: expect.stringMatching(/^[a-f0-9]{64}$/),
      actionId: request.actionId,
      componentId: "database",
      action: "restart_component",
      correlationId: "decision-1",
      authorizationRef: "auth-1",
      leaseId: "lease-1",
      fencingToken: 7,
      startedAt: "2026-09-08T12:00:02.000Z",
      finishedAt: "2026-09-08T12:00:03.000Z",
      status: "executed",
      reasonCode: "SIMULATED_SUCCESS",
    });
    expect(Object.keys(event).sort()).toEqual([
      "action",
      "actionId",
      "authorizationRef",
      "componentId",
      "correlationId",
      "evidenceId",
      "evidenceVersion",
      "eventType",
      "fencingToken",
      "finishedAt",
      "leaseId",
      "reasonCode",
      "startedAt",
      "status",
    ]);
  });

  it("binds the evidence id deterministically to the authorization and lease identity", () => {
    const input = {
      request,
      startedAt: "2026-09-08T12:00:02.000Z",
      finishedAt: "2026-09-08T12:00:03.000Z",
      status: "executed" as const,
      reasonCode: "SIMULATED_SUCCESS",
    };

    const first = buildRecoveryExecutionAuditEvent(input) as unknown as Record<string, unknown>;
    const second = buildRecoveryExecutionAuditEvent(input) as unknown as Record<string, unknown>;
    const changedAuthorization = buildRecoveryExecutionAuditEvent({
      ...input,
      request: { ...request, authorizationRef: "auth-2" },
    }) as unknown as Record<string, unknown>;

    expect(first.evidenceId).toMatch(/^[a-f0-9]{64}$/);
    expect(second.evidenceId).toBe(first.evidenceId);
    expect(changedAuthorization.evidenceId).not.toBe(first.evidenceId);
  });

  it("converts unknown exceptions to one constant sanitized failure without leaking diagnostics", () => {
    const failure = sanitizeRecoveryExecutionFailure(
      new Error("host=10.0.0.5 token=abc command=systemctl restart db\nSTACK SECRET"),
    );

    expect(failure).toEqual({
      status: "failed",
      reasonCode: "INTERNAL_SANITIZED_FAILURE",
    });
    expect(JSON.stringify(failure)).not.toMatch(/10\.0\.0\.5|token=abc|systemctl|STACK SECRET/i);
  });

  it("does not preserve arbitrary object fields, credentials or commands in sanitized failures", () => {
    const failure = sanitizeRecoveryExecutionFailure({
      message: "boom",
      password: "super-secret",
      apiKey: "abc123",
      host: "infra.internal",
      command: "docker restart critical-db",
    });

    const serialized = JSON.stringify(failure);
    expect(failure.reasonCode).toBe("INTERNAL_SANITIZED_FAILURE");
    expect(serialized).not.toMatch(/super-secret|abc123|infra\.internal|docker restart|boom/i);
  });
});
