import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecoveryActionResult } from "./recoveryAction";
import type {
  RecoveryActionRecord,
  RecoveryExecutionLedgerPort,
} from "./recoveryActionRecord";
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
  leaseId: "lease-1",
  namespace: "d011b3-v1",
  tenantId: "tenant-7",
  componentId: "database",
  actionId: "action:decision-1",
  ownerId: "node-a",
  fencingToken: 7,
  acquiredAt: "2026-09-08T12:00:00.000Z",
  expiresAt: "2026-09-08T12:01:00.000Z",
};

const reserved: RecoveryActionRecord = {
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

const simulatedSuccess: RecoveryActionResult = {
  actionId: request.actionId,
  componentId: request.componentId,
  status: "simulated_success",
  reasonCode: "SIMULATED_SUCCESS",
  startedAt: "2026-09-08T12:00:02.000Z",
  finishedAt: "2026-09-08T12:00:03.000Z",
  durationMs: 1000,
  correlationId: request.correlationId,
};

afterEach(() => vi.useRealTimers());

function harness(overrides: {
  guardAllowed?: boolean;
  guardReason?: string;
  finalFenceValid?: boolean;
  firstTransitionStatus?: "transitioned" | "state_conflict" | "existing_terminal" | "store_unavailable";
  executor?: RecoveryExecutorPort;
  now?: () => Date;
} = {}) {
  const calls: string[] = [];
  let current = reserved;

  const guard = {
    evaluate: vi.fn(async () => {
      calls.push("guard");
      return overrides.guardAllowed === false
        ? { allowed: false as const, reasonCode: (overrides.guardReason ?? "AUTHORIZATION_DENIED") as any }
        : { allowed: true as const, reasonCode: "EXECUTION_ALLOWED" as const };
    }),
  };

  const ledger: RecoveryExecutionLedgerPort = {
    get: vi.fn(async () => current),
    compareAndSetState: vi.fn(async input => {
      calls.push(`ledger:${input.expectedState}->${input.nextState}`);
      if (input.expectedState === "reserved" && overrides.firstTransitionStatus) {
        if (overrides.firstTransitionStatus === "store_unavailable") return { status: "store_unavailable" as const };
        return { status: overrides.firstTransitionStatus as any, record: current };
      }
      if (current.state !== input.expectedState) return { status: "state_conflict" as const, record: current };
      current = { ...current, state: input.nextState, updatedAt: input.at };
      return { status: "transitioned" as const, record: current };
    }),
  };

  const leasePort: RecoveryLeasePort = {
    acquire: vi.fn() as any,
    release: vi.fn() as any,
    validateFence: vi.fn(async () => {
      calls.push("final-fence");
      return overrides.finalFenceValid !== false;
    }),
  };

  const executor: RecoveryExecutorPort = overrides.executor ?? {
    capability: "simulation",
    execute: vi.fn(async () => {
      calls.push("executor");
      return simulatedSuccess;
    }),
  };

  const audit: RecoveryExecutionAuditPort = {
    append: vi.fn(async () => undefined),
  };

  const boundary = createRecoveryExecutionBoundary({
    guard,
    ledger,
    leasePort,
    executor,
    audit,
    now: overrides.now ?? (() => new Date("2026-09-08T12:00:02.000Z")),
  } as any);

  return { boundary, guard, ledger, leasePort, executor, audit, calls };
}

describe("D-011B.4 RecoveryExecutionBoundary", () => {
  it("runs guard, claims the ledger, revalidates fence immediately before executor and terminalizes success", async () => {
    const h = harness();
    const result = await h.boundary.execute({ request, lease });

    expect(result).toEqual(expect.objectContaining({ status: "executed", reasonCode: "SIMULATED_SUCCESS" }));
    expect(h.calls).toEqual([
      "guard",
      "ledger:reserved->executing",
      "final-fence",
      "executor",
      "ledger:executing->completed_success",
    ]);
    expect(h.executor.execute).toHaveBeenCalledTimes(1);
  });

  it("appends one allowlisted audit event for a completed simulated execution", async () => {
    const h = harness();
    await h.boundary.execute({ request, lease });
    expect(h.audit.append).toHaveBeenCalledTimes(1);
    expect(h.audit.append).toHaveBeenCalledWith({
      eventType: "recovery.execution.finished",
      actionId: request.actionId,
      componentId: request.componentId,
      action: request.action,
      correlationId: request.correlationId,
      fencingToken: request.fencingToken,
      startedAt: "2026-09-08T12:00:02.000Z",
      finishedAt: "2026-09-08T12:00:02.000Z",
      status: "executed",
      reasonCode: "SIMULATED_SUCCESS",
    });
  });

  it("never touches ledger or executor when the safety guard denies", async () => {
    const h = harness({ guardAllowed: false, guardReason: "KILL_SWITCH_OFF" });
    const result = await h.boundary.execute({ request, lease });

    expect(result).toEqual({ status: "rejected", reasonCode: "KILL_SWITCH_OFF" });
    expect(h.ledger.compareAndSetState).not.toHaveBeenCalled();
    expect(h.executor.execute).not.toHaveBeenCalled();
  });

  it("does not invoke twice when reserved -> executing loses the atomic claim", async () => {
    const h = harness({ firstTransitionStatus: "state_conflict" });
    const result = await h.boundary.execute({ request, lease });

    expect(result).toEqual(expect.objectContaining({ status: "rejected", reasonCode: "EXECUTION_ALREADY_CLAIMED" }));
    expect(h.leasePort.validateFence).not.toHaveBeenCalled();
    expect(h.executor.execute).not.toHaveBeenCalled();
  });

  it("fails closed and terminalizes verification failure when the fence changes after claim", async () => {
    const h = harness({ finalFenceValid: false });
    const result = await h.boundary.execute({ request, lease });

    expect(result).toEqual({ status: "rejected", reasonCode: "FENCE_REVALIDATION_FAILED" });
    expect(h.calls).toEqual([
      "guard",
      "ledger:reserved->executing",
      "final-fence",
      "ledger:executing->verification_failed",
    ]);
    expect(h.executor.execute).not.toHaveBeenCalled();
  });

  it("sanitizes executor exceptions and records unknown_outcome after invocation", async () => {
    const executor: RecoveryExecutorPort = {
      capability: "simulation",
      execute: vi.fn(async () => {
        throw new Error("secret host=10.0.0.5 token=abc stack details");
      }),
    };
    const h = harness({ executor });
    const result = await h.boundary.execute({ request, lease });

    expect(result).toEqual({ status: "failed", reasonCode: "EXECUTOR_FAILURE_SANITIZED" });
    expect(JSON.stringify(result)).not.toMatch(/10\.0\.0\.5|token=abc|stack details/);
    expect(h.ledger.compareAndSetState).toHaveBeenLastCalledWith(expect.objectContaining({
      actionId: request.actionId,
      expectedState: "executing",
      expectedFencingToken: 7,
      nextState: "unknown_outcome",
    }));
  });

  it("rejects non-simulation executor capability before invocation", async () => {
    const h = harness({ executor: { capability: "real" as any, execute: vi.fn() } });
    const result = await h.boundary.execute({ request, lease });

    expect(result).toEqual({ status: "rejected", reasonCode: "REAL_EXECUTOR_FORBIDDEN" });
    expect(h.executor.execute).not.toHaveBeenCalled();
  });

  it("rejects an already-expired execution deadline before claiming or invoking", async () => {
    const h = harness({ now: () => new Date("2026-09-08T12:02:00.000Z") });
    const result = await h.boundary.execute({ request, lease });

    expect(result).toEqual({ status: "rejected", reasonCode: "EXECUTION_DEADLINE_EXCEEDED" });
    expect(h.ledger.compareAndSetState).not.toHaveBeenCalled();
    expect(h.executor.execute).not.toHaveBeenCalled();
  });

  it("times out cooperatively, aborts the simulator and ignores late completion", async () => {
    vi.useFakeTimers();
    let resolveExecutor!: (value: RecoveryActionResult) => void;
    let observedSignal: AbortSignal | undefined;
    const executor: RecoveryExecutorPort = {
      capability: "simulation",
      execute: vi.fn(async (_request, signal) => {
        observedSignal = signal;
        return await new Promise<RecoveryActionResult>(resolve => { resolveExecutor = resolve; });
      }),
    };
    const shortRequest = { ...request, deadlineAt: "2026-09-08T12:00:02.010Z" };
    const h = harness({ executor });
    const pending = h.boundary.execute({ request: shortRequest, lease });

    await vi.advanceTimersByTimeAsync(11);
    const result = await pending;
    expect(result).toEqual({ status: "failed", reasonCode: "EXECUTION_TIMEOUT" });
    expect(observedSignal?.aborted).toBe(true);
    expect(h.ledger.compareAndSetState).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedState: "executing",
      nextState: "completed_failure",
    }));

    const transitionCount = (h.ledger.compareAndSetState as any).mock.calls.length;
    resolveExecutor(simulatedSuccess);
    await Promise.resolve();
    expect((h.ledger.compareAndSetState as any).mock.calls.length).toBe(transitionCount);
  });

  it("cancels cooperatively and terminalizes once even if the simulator finishes later", async () => {
    let resolveExecutor!: (value: RecoveryActionResult) => void;
    let observedSignal: AbortSignal | undefined;
    const executor: RecoveryExecutorPort = {
      capability: "simulation",
      execute: vi.fn(async (_request, signal) => {
        observedSignal = signal;
        return await new Promise<RecoveryActionResult>(resolve => { resolveExecutor = resolve; });
      }),
    };
    const controller = new AbortController();
    const h = harness({ executor });
    const pending = h.boundary.execute({ request, lease, signal: controller.signal });
    await Promise.resolve();
    controller.abort();

    const result = await pending;
    expect(result).toEqual({ status: "failed", reasonCode: "EXECUTION_CANCELLED" });
    expect(observedSignal?.aborted).toBe(true);
    expect(h.ledger.compareAndSetState).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedState: "executing",
      nextState: "completed_failure",
    }));

    const transitionCount = (h.ledger.compareAndSetState as any).mock.calls.length;
    resolveExecutor(simulatedSuccess);
    await Promise.resolve();
    expect((h.ledger.compareAndSetState as any).mock.calls.length).toBe(transitionCount);
  });
});
