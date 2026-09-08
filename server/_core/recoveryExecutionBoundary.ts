import type { RecoveryActionReasonCode } from "./recoveryAction";
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

function terminalStateFor(status: string): RecoveryActionRecordState {
  if (status === "simulated_success") return "completed_success";
  if (status === "simulated_failure") return "completed_failure";
  return "unknown_outcome";
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

  return {
    async execute(input: {
      request: RecoveryExecutionRequest;
      lease: RecoveryLease;
    }): Promise<RecoveryExecutionBoundaryResult> {
      const { request, lease } = input;

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

      try {
        const result = await executor.execute(request);
        const terminal = await transition(
          request,
          "executing",
          terminalStateFor(result.status),
        );
        if (terminal.status !== "transitioned" && terminal.status !== "existing_terminal") {
          return { status: "failed", reasonCode: "LEDGER_FINALIZATION_FAILED" };
        }
        return {
          status: "executed",
          reasonCode: result.reasonCode,
          record: terminal.record,
        };
      } catch {
        await transition(request, "executing", "unknown_outcome");
        return { status: "failed", reasonCode: "EXECUTOR_FAILURE_SANITIZED" };
      }
    },
  };
}
