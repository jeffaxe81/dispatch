import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecoveryActionRecord, RecoveryExecutionLedgerPort } from "./recoveryActionRecord";
import type { RecoveryExecutionRequest, RecoveryExecutorPort } from "./recoveryExecution";
import type { RecoveryExecutionAuditPort } from "./recoveryExecutionAudit";
import { createRecoveryExecutionBoundary } from "./recoveryExecutionBoundary";
import type { RecoveryLease, RecoveryLeasePort } from "./recoveryLease";

const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;

const request: RecoveryExecutionRequest = {
  tenantId: "tenant-7",
  actionId: "action:long-deadline",
  transitionId: "transition-long-deadline",
  componentId: "database",
  action: "restart_component",
  requestedAt: "2026-09-08T12:00:00.000Z",
  correlationId: "long-deadline",
  reservationId: "action:long-deadline",
  leaseId: "lease-long-deadline",
  leaseNamespace: "d011b3-v1",
  ownerId: "node-a",
  fencingToken: 11,
  authorizationRef: "auth-long-deadline",
  deadlineAt: "2026-11-08T12:00:00.000Z",
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

afterEach(() => vi.restoreAllMocks());

describe("D-011B.4 long deadline timer safety", () => {
  it("never schedules a Node timer above the signed 32-bit delay limit", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
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
      })),
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

    expect(result.status).toBe("executed");
    const scheduledDelays = setTimeoutSpy.mock.calls
      .map(call => Number(call[1]))
      .filter(Number.isFinite);
    expect(scheduledDelays.length).toBeGreaterThan(0);
    expect(Math.max(...scheduledDelays)).toBeLessThanOrEqual(MAX_NODE_TIMER_DELAY_MS);
  });
});
