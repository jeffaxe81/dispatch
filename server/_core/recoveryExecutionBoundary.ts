import type {
  RecoveryActionReasonCode,
  RecoveryActionResult,
} from "./recoveryAction";
import {
  commitRecoveryActionStateTransition,
  type RecoveryActionRecord,
  type RecoveryActionRecordState,
  type RecoveryExecutionLedgerPort,
} from "./recoveryActionRecord";
import {
  validateRecoveryExecutorCapability,
  type RecoveryExecutionRequest,
  type RecoveryExecutorPort,
} from "./recoveryExecution";
import type {
  RecoveryExecutionSafetyDecision,
  RecoveryExecutionSafetyReasonCode,
} from "./recoveryExecutionSafetyGuard";
import type { RecoveryLease, RecoveryLeasePort } from "./recoveryLease";

export type RecoveryExecutionBoundaryReasonCode =
  | RecoveryExecutionSafetyReasonCode
  | RecoveryActionReasonCode
  | "REAL_EXECUTOR_FORBIDDEN"
  | "EXECUTION_ALREADY_CLAIMED"
  | "ACTION_STORE_UNAVAILABLE"
  | "FENCE_REVALIDATION_FAILED"
  | "EXECUTION_DEADLINE_EXCEEDED"
  | "EXECUTION_TIMEOUT"
  | "EXECUTION_CANCELLED"
  | "LEDGER_FINALIZATION_FAILED"
  | "EXECUTOR_FAILURE_SANITIZED";

export type RecoveryExecutionBoundaryResult =
  | Readonly<{
      status: "executed";
      reasonCode: RecoveryExecutionBoundaryReasonCode;
      record: RecoveryActionRecord;
    }>
  | Readonly<{
      status: "rejected";
      reasonCode: RecoveryExecutionBoundaryReasonCode;
    }>
  | Readonly<{
      status: "failed";
      reasonCode: RecoveryExecutionBoundaryReasonCode;
    }>;

export type RecoveryExecutionSafetyGuardPort = Readonly<{
  evaluate(input: {
    request: RecoveryExecutionRequest;
    lease: RecoveryLease;
    executorCapability: unknown;
  }): Promise<RecoveryExecutionSafetyDecision>;
}>;

type ExecutionRaceOutcome =
  | Readonly<{ kind: "result"; result: RecoveryActionResult }>
  | Readonly<{ kind: "executor_failure" }>
  | Readonly<{ kind: "timeout" }>
  | Readonly<{ kind: "cancelled" }>;

function terminalStateFor(status: RecoveryActionResult["status"]): RecoveryActionRecordState {
  return status === "simulated_success" ? "completed_success" : "completed_failure";
}

export function createRecoveryExecutionBoundary(options: {
  guard: RecoveryExecutionSafetyGuardPort;
  ledger: RecoveryExecutionLedgerPort;
  leasePort: RecoveryLeasePort;
  executor: RecoveryExecutorPort;
  now?: () => Date;
}) {
  const { guard, ledger, leasePort, executor } = options;
  const now = options.now ?? (() => new Date());

  const transition = (
    request: RecoveryExecutionRequest,
    expectedState: RecoveryActionRecordState,
    nextState: RecoveryActionRecordState,
  ) => commitRecoveryActionStateTransition(ledger, {
    actionId: request.actionId,
    expectedState,
    expectedFencingToken: request.fencingToken,
    nextState,
    at: now().toISOString(),
  });

  const finalizeFailure = async (
    request: RecoveryExecutionRequest,
    reasonCode: "EXECUTION_TIMEOUT" | "EXECUTION_CANCELLED",
  ): Promise<RecoveryExecutionBoundaryResult> => {
    const terminal = await transition(request, "executing", "completed_failure");
    if (terminal.status !== "transitioned" && terminal.status !== "existing_terminal") {
      return { status: "failed", reasonCode: "LEDGER_FINALIZATION_FAILED" };
    }
    return { status: "failed", reasonCode };
  };

  return {
    async execute(input: {
      request: RecoveryExecutionRequest;
      lease: RecoveryLease;
      signal?: AbortSignal;
    }): Promise<RecoveryExecutionBoundaryResult> {
      const { request, lease, signal } = input;

      const safety = await guard.evaluate({
        request,
        lease,
        executorCapability: executor.capability,
      });
      if (!safety.allowed) {
        return { status: "rejected", reasonCode: safety.reasonCode };
      }

      const capability = validateRecoveryExecutorCapability(executor.capability);
      if (!capability.valid) {
        return { status: "rejected", reasonCode: "REAL_EXECUTOR_FORBIDDEN" };
      }

      const deadlineAtMs = Date.parse(request.deadlineAt);
      const beforeClaimMs = now().getTime();
      if (!Number.isFinite(deadlineAtMs) || !Number.isFinite(beforeClaimMs) || deadlineAtMs <= beforeClaimMs) {
        return { status: "rejected", reasonCode: "EXECUTION_DEADLINE_EXCEEDED" };
      }

      const claimed = await transition(request, "reserved", "executing");
      if (claimed.status === "store_unavailable") {
        return { status: "failed", reasonCode: "ACTION_STORE_UNAVAILABLE" };
      }
      if (claimed.status !== "transitioned") {
        return { status: "rejected", reasonCode: "EXECUTION_ALREADY_CLAIMED" };
      }

      let fenceValid = false;
      try {
        fenceValid = await leasePort.validateFence(lease);
      } catch {
        fenceValid = false;
      }

      if (!fenceValid) {
        await transition(request, "executing", "verification_failed");
        return { status: "rejected", reasonCode: "FENCE_REVALIDATION_FAILED" };
      }

      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let cancelListener: (() => void) | undefined;

      const executionPromise: Promise<ExecutionRaceOutcome> = (() => {
        try {
          return Promise.resolve(executor.execute(request, controller.signal)).then(
            result => ({ kind: "result", result }) as const,
            () => ({ kind: "executor_failure" }) as const,
          );
        } catch {
          return Promise.resolve({ kind: "executor_failure" } as const);
        }
      })();

      const remainingMs = Math.max(0, deadlineAtMs - now().getTime());
      const timeoutPromise = new Promise<ExecutionRaceOutcome>(resolve => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          resolve({ kind: "timeout" });
        }, remainingMs);
      });

      const cancellationPromise = new Promise<ExecutionRaceOutcome>(resolve => {
        if (!signal) return;
        cancelListener = () => {
          controller.abort();
          resolve({ kind: "cancelled" });
        };
        if (signal.aborted) {
          cancelListener();
          return;
        }
        signal.addEventListener("abort", cancelListener, { once: true });
      });

      const outcome = await Promise.race([
        executionPromise,
        timeoutPromise,
        cancellationPromise,
      ]);

      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      if (signal && cancelListener) signal.removeEventListener("abort", cancelListener);

      if (outcome.kind === "timeout") {
        return finalizeFailure(request, "EXECUTION_TIMEOUT");
      }
      if (outcome.kind === "cancelled") {
        return finalizeFailure(request, "EXECUTION_CANCELLED");
      }
      if (outcome.kind === "executor_failure") {
        await transition(request, "executing", "unknown_outcome");
        return { status: "failed", reasonCode: "EXECUTOR_FAILURE_SANITIZED" };
      }

      const terminal = await transition(
        request,
        "executing",
        terminalStateFor(outcome.result.status),
      );
      if (terminal.status !== "transitioned" && terminal.status !== "existing_terminal") {
        return { status: "failed", reasonCode: "LEDGER_FINALIZATION_FAILED" };
      }
      return {
        status: "executed",
        reasonCode: outcome.result.reasonCode,
        record: terminal.record,
      };
    },
  };
}
