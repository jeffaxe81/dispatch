import {
  authorizeRecoveryAction,
  type ActiveRecoveryConfig,
} from "./activeRecoveryAuthorization";
import {
  isTerminalRecoveryActionState,
  sameRecoveryActionIdentity,
  type RecoveryActionRecordPort,
} from "./recoveryActionRecord";
import {
  isValidRecoveryLease,
  type RecoveryLease,
  type RecoveryLeasePort,
} from "./recoveryLease";
import {
  validateRecoveryExecutionRequest,
  validateRecoveryExecutorCapability,
  type RecoveryExecutionRequest,
} from "./recoveryExecution";

export type RecoveryExecutionSafetyReasonCode =
  | "EXECUTION_ALLOWED"
  | "EXECUTION_CONTEXT_INVALID"
  | "KILL_SWITCH_OFF"
  | "AUTHORIZATION_DENIED"
  | "RESERVATION_MISMATCH"
  | "LEASE_MISMATCH"
  | "STALE_LEASE"
  | "OWNER_MISMATCH"
  | "FENCING_MISMATCH"
  | "UNSUPPORTED_ACTION"
  | "REAL_EXECUTOR_FORBIDDEN"
  | "ACTION_STORE_UNAVAILABLE";

export type RecoveryExecutionSafetyDecision = Readonly<{
  allowed: boolean;
  reasonCode: RecoveryExecutionSafetyReasonCode;
}>;

const allow = (): RecoveryExecutionSafetyDecision => ({
  allowed: true,
  reasonCode: "EXECUTION_ALLOWED",
});

const deny = (
  reasonCode: Exclude<RecoveryExecutionSafetyReasonCode, "EXECUTION_ALLOWED">,
): RecoveryExecutionSafetyDecision => ({ allowed: false, reasonCode });

export function createRecoveryExecutionSafetyGuard(options: {
  activeConfig: ActiveRecoveryConfig;
  leasePort: RecoveryLeasePort;
  recordPort: RecoveryActionRecordPort;
  now?: () => Date;
}): {
  evaluate(input: {
    request: RecoveryExecutionRequest;
    lease: RecoveryLease;
    executorCapability: unknown;
  }): Promise<RecoveryExecutionSafetyDecision>;
} {
  const { activeConfig, leasePort, recordPort } = options;
  const now = options.now ?? (() => new Date());

  return {
    async evaluate({ request, lease, executorCapability }) {
      if ((request as { action?: unknown }).action !== "restart_component") {
        return deny("UNSUPPORTED_ACTION");
      }

      const requestValidation = validateRecoveryExecutionRequest(request);
      if (!requestValidation.valid) {
        return deny("EXECUTION_CONTEXT_INVALID");
      }

      const capabilityValidation = validateRecoveryExecutorCapability(executorCapability);
      if (!capabilityValidation.valid) {
        return deny("REAL_EXECUTOR_FORBIDDEN");
      }

      const authorization = authorizeRecoveryAction({
        request: {
          actionId: request.actionId,
          transitionId: request.transitionId,
          componentId: request.componentId,
          action: request.action,
          requestedAt: request.requestedAt,
          correlationId: request.correlationId,
        },
        config: activeConfig,
      });
      if (!authorization.authorized) {
        return deny(
          authorization.reasonCode === "ACTIVE_RECOVERY_DISABLED"
            ? "KILL_SWITCH_OFF"
            : "AUTHORIZATION_DENIED",
        );
      }

      if (request.reservationId !== request.actionId) {
        return deny("RESERVATION_MISMATCH");
      }

      if (!isValidRecoveryLease(lease)) {
        return deny("STALE_LEASE");
      }

      if (
        lease.leaseId !== request.leaseId
        || lease.namespace !== request.leaseNamespace
        || lease.componentId !== request.componentId
        || lease.actionId !== request.actionId
      ) {
        return deny("LEASE_MISMATCH");
      }

      if (lease.ownerId !== request.ownerId) {
        return deny("OWNER_MISMATCH");
      }

      if (lease.fencingToken !== request.fencingToken) {
        return deny("FENCING_MISMATCH");
      }

      const nowMs = now().getTime();
      const expiresAtMs = Date.parse(lease.expiresAt);
      if (!Number.isFinite(nowMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
        return deny("STALE_LEASE");
      }

      let record;
      try {
        record = await recordPort.get(request.reservationId);
      } catch {
        return deny("ACTION_STORE_UNAVAILABLE");
      }

      if (!record) {
        return deny("RESERVATION_MISMATCH");
      }

      if (record.fencingToken !== request.fencingToken) {
        return deny("FENCING_MISMATCH");
      }

      if (
        record.state !== "reserved"
        || isTerminalRecoveryActionState(record.state)
        || !sameRecoveryActionIdentity(record, {
          actionId: request.actionId,
          componentId: request.componentId,
          correlationId: request.correlationId,
          action: request.action,
        })
      ) {
        return deny("RESERVATION_MISMATCH");
      }

      let fenceValid = false;
      try {
        fenceValid = await leasePort.validateFence(lease);
      } catch {
        fenceValid = false;
      }

      if (!fenceValid) {
        return deny("STALE_LEASE");
      }

      return allow();
    },
  };
}
