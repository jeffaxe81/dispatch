import { describe, expect, it, vi } from "vitest";
import type { RecoveryActionRecord, RecoveryExecutionLedgerPort } from "./recoveryActionRecord";
import type { RecoveryExecutionRequest, RecoveryExecutorPort } from "./recoveryExecution";
import type { RecoveryExecutionAuditPort } from "./recoveryExecutionAudit";
import type { RecoveryLease, RecoveryLeasePort } from "./recoveryLease";
import { createRecoveryExecutionBoundary } from "./recoveryExecutionBoundary";

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
  acquiredAt: request.requestedAt,
  expiresAt: request.deadlineAt,
};

function createHarness(executor: RecoveryExecutorPort) {
  let current: RecoveryActionRecord = {
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
    get: vi.fn(async () => current),
    compareAndSetState: vi.fn(async input => {
      if (current.state !== input.expectedState) {
        return { status: "state_conflict" as const, record: current };
      }
      current = { ...current, state: input.nextState, updatedAt: input.at };
      return { status: "transitioned" as const, record: current };
    }),
  };

  const leasePort: RecoveryLeasePort = {
    acquire: vi.fn() as any,
    release: vi.fn() as any,
    validateFence: vi.fn(async () => true),
  };

  const audit: RecoveryExecutionAuditPort = {
    append: vi.fn(async () => undefined),
  };

  return {
    ledger,
    boundary: createRecoveryExecutionBoundary({
      guard: { evaluate: vi.fn(async () => ({ allowed: true as const, reasonCode: "EXECUTION_ALLOWED" as const })) },
      ledger,
      leasePort,
      executor,
      audit,
      now: () => new Date("2026-09-08T12:00:02.000Z"),
    }),
  };
}

describe("D-011B.4 executor result binding", () => {
  it.each([
    ["actionId", "action:other"],
    ["componentId", "storage"],
    ["correlationId", "decision-other"],
  ] as const)("fails closed when executor returns mismatched %s", async (field, value) => {
    const executor: RecoveryExecutorPort = {
      capability: "simulation",
      execute: vi.fn(async () => ({
        actionId: request.actionId,
        componentId: request.componentId,
        status: "simulated_success" as const,
        reasonCode: "SIMULATED_SUCCESS" as const,
        startedAt: "2026-09-08T12:00:02.000Z",
        finishedAt: "2026-09-08T12:00:03.000Z",
        durationMs: 1000,
        correlationId: request.correlationId,
        [field]: value,
      })),
    };
    const h = createHarness(executor);

    const result = await h.boundary.execute({ request, lease });

    expect(result).toEqual({ status: "failed", reasonCode: "EXECUTOR_RESULT_MISMATCH" });
    expect(h.ledger.compareAndSetState).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedTenantId: request.tenantId,
      expectedState: "executing",
      expectedFencingToken: request.fencingToken,
      nextState: "unknown_outcome",
    }));
  });
});
