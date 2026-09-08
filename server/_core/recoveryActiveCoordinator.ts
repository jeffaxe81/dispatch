import {
  authorizeRecoveryAction,
  type ActiveRecoveryConfig,
} from "./activeRecoveryAuthorization";
import type { RecoveryActionRequest } from "./recoveryAction";
import type { RecoveryActionRecordPort } from "./recoveryActionRecord";
import {
  isValidRecoveryLease,
  type RecoveryLease,
  type RecoveryLeasePort,
} from "./recoveryLease";

export type RecoveryActiveCoordinationResult = Readonly<{
  allowedToReachFutureAdapter: boolean;
  reasonCode:
    | "AUTHORIZED_AND_RESERVED"
    | "AUTHORIZATION_DENIED"
    | "LEASE_DENIED"
    | "LEASE_BACKEND_UNAVAILABLE"
    | "ACTION_DUPLICATE_TERMINAL"
    | "ACTION_ALREADY_IN_PROGRESS"
    | "ACTION_CONFLICT"
    | "ACTION_STORE_UNAVAILABLE"
    | "FENCE_INVALID";
  fencingToken?: number;
}>;

export function createRecoveryActiveCoordinator(options: {
  config: ActiveRecoveryConfig;
  leasePort: RecoveryLeasePort;
  recordPort: RecoveryActionRecordPort;
  ownerId: string;
  leaseTtlMs: number;
  now?: () => Date;
}): {
  prepare(request: RecoveryActionRequest): Promise<RecoveryActiveCoordinationResult>;
} {
  const { config, leasePort, recordPort, ownerId, leaseTtlMs } = options;

  const deny = (
    reasonCode: Exclude<RecoveryActiveCoordinationResult["reasonCode"], "AUTHORIZED_AND_RESERVED">,
  ): RecoveryActiveCoordinationResult => ({
    allowedToReachFutureAdapter: false,
    reasonCode,
  });

  const safeRelease = async (lease: RecoveryLease): Promise<void> => {
    try {
      await leasePort.release(lease);
    } catch {
      // Release failure must not turn a denied preparation into an executable path.
    }
  };

  return {
    async prepare(request) {
      const authorization = authorizeRecoveryAction({ request, config });
      if (!authorization.authorized) {
        return deny("AUTHORIZATION_DENIED");
      }

      let acquireResult;
      try {
        acquireResult = await leasePort.acquire({
          namespace: authorization.leaseNamespace,
          componentId: request.componentId,
          actionId: request.actionId,
          ownerId,
          ttlMs: leaseTtlMs,
        });
      } catch {
        return deny("LEASE_BACKEND_UNAVAILABLE");
      }

      if (!acquireResult.acquired) {
        return deny(
          acquireResult.reasonCode === "LEASE_BACKEND_UNAVAILABLE"
            ? "LEASE_BACKEND_UNAVAILABLE"
            : "LEASE_DENIED",
        );
      }

      const lease = acquireResult.lease;
      if (!isValidRecoveryLease(lease)) {
        await safeRelease(lease);
        return deny("LEASE_DENIED");
      }

      let reserveResult;
      try {
        reserveResult = await recordPort.reserve({
          actionId: request.actionId,
          componentId: request.componentId,
          correlationId: request.correlationId,
          action: request.action,
          fencingToken: lease.fencingToken,
        });
      } catch {
        await safeRelease(lease);
        return deny("ACTION_STORE_UNAVAILABLE");
      }

      if (reserveResult.status !== "reserved") {
        await safeRelease(lease);
        switch (reserveResult.status) {
          case "existing_terminal":
            return deny("ACTION_DUPLICATE_TERMINAL");
          case "existing_non_terminal":
            return deny("ACTION_ALREADY_IN_PROGRESS");
          case "conflict":
            return deny("ACTION_CONFLICT");
          case "store_unavailable":
            return deny("ACTION_STORE_UNAVAILABLE");
        }
      }

      let fenceValid = false;
      try {
        fenceValid = await leasePort.validateFence(lease);
      } catch {
        fenceValid = false;
      }

      if (!fenceValid) {
        await safeRelease(lease);
        return deny("FENCE_INVALID");
      }

      return {
        allowedToReachFutureAdapter: true,
        reasonCode: "AUTHORIZED_AND_RESERVED",
        fencingToken: lease.fencingToken,
      };
    },
  };
}
