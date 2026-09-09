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

describe("D-011B.4 guard failure boundary", () => {
  it("fails closed and sanitizes an unexpected guard exception before executor invocation", async () => {
    const record: RecoveryActionRecord = {
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
      get: vi.fn(async () => record),
      compareAndSetState: vi.fn(),
    };
    const leasePort: RecoveryLeasePort = {
      acquire: vi.fn() as any,
      validateFence: vi.fn(),
      release: vi.fn(),
    };
    const executor: RecoveryExecutorPort = {
      capability: "simulation",
      execute: vi.fn(),
    };
    const audit: RecoveryExecutionAuditPort = {
      append: vi.fn(async () => undefined),
    };
    const boundary = createRecoveryExecutionBoundary({
      guard: {
        evaluate: vi.fn(async () => {
          throw new Error("database password=secret host=10.0.0.8 stack details");
        }),
      },
      ledger,
      leasePort,
      executor,
      audit,
      now: () => new Date("2026-09-08T12:00:02.000Z"),
    });

    await expect(boundary.execute({ request, lease })).resolves.toEqual({
      status: "rejected",
      reasonCode: "INTERNAL_SANITIZED_FAILURE",
    });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(ledger.compareAndSetState).not.toHaveBeenCalled();
    expect(JSON.stringify(await boundary.execute({ request, lease }))).not.toMatch(
      /password=secret|10\.0\.0\.8|stack details/,
    );
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({
      status: "rejected",
      reasonCode: "INTERNAL_SANITIZED_FAILURE",
    }));
  });
});
