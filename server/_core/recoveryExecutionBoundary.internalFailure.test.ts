import { describe, expect, it, vi } from "vitest";
import type { RecoveryActionRecord, RecoveryExecutionLedgerPort } from "./recoveryActionRecord";
import { createRecoveryExecutionBoundary } from "./recoveryExecutionBoundary";
import type { RecoveryExecutionRequest, RecoveryExecutorPort } from "./recoveryExecution";
import type { RecoveryExecutionAuditPort } from "./recoveryExecutionAudit";
import type { RecoveryLease, RecoveryLeasePort } from "./recoveryLease";

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

const lease: RecoveryLease = {
  leaseId: request.leaseId,
  namespace: request.leaseNamespace,
  tenantId: request.tenantId,
  componentId: request.componentId,
  actionId: request.actionId,
  ownerId: request.ownerId,
  fencingToken: request.fencingToken,
  acquiredAt: "2026-09-08T12:00:00.000Z",
  expiresAt: "2026-09-08T12:01:00.000Z",
};

describe("D-011B.4 sanitized unknown failure", () => {
  it("converts an executor exception to INTERNAL_SANITIZED_FAILURE and keeps unknown_outcome", async () => {
    let record: RecoveryActionRecord = {
      actionId: request.actionId,
      tenantId: request.tenantId,
      componentId: request.componentId,
      correlationId: request.correlationId,
      action: request.action,
      state: "reserved",
      fencingToken: request.fencingToken,
      createdAt: request.requestedAt,
      updatedAt: request.requestedAt,
    };
    const ledger: RecoveryExecutionLedgerPort = {
      get: async () => record,
      compareAndSetState: vi.fn(async input => {
        if (record.state !== input.expectedState) return { status: "state_conflict" as const, record };
        record = { ...record, state: input.nextState, updatedAt: input.at };
        return { status: "transitioned" as const, record };
      }),
    };
    const leasePort: RecoveryLeasePort = {
      acquire: vi.fn() as any,
      validateFence: vi.fn(async () => true),
      release: vi.fn(async () => undefined),
    };
    const executor: RecoveryExecutorPort = {
      capability: "simulation",
      execute: vi.fn(async () => {
        throw new Error("secret token=abc host=10.0.0.5 stack details");
      }),
    };
    const audit: RecoveryExecutionAuditPort = { append: vi.fn(async () => undefined) };
    const boundary = createRecoveryExecutionBoundary({
      guard: { evaluate: vi.fn(async () => ({ allowed: true as const, reasonCode: "EXECUTION_ALLOWED" as const })) },
      ledger,
      leasePort,
      executor,
      audit,
      now: () => new Date("2026-09-08T12:00:02.000Z"),
    });

    const result = await boundary.execute({ request, lease });
    expect(result).toEqual({ status: "failed", reasonCode: "INTERNAL_SANITIZED_FAILURE" });
    expect(JSON.stringify(result)).not.toMatch(/token=abc|10\.0\.0\.5|stack details/);
    expect(record.state).toBe("unknown_outcome");
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      reasonCode: "INTERNAL_SANITIZED_FAILURE",
    }));
  });
});
