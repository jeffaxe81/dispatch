import { describe, expect, it, vi } from "vitest";
import type { ActiveRecoveryConfig } from "./activeRecoveryAuthorization";
import type { RecoveryActionRequest } from "./recoveryAction";
import type { RecoveryActionRecord, RecoveryActionRecordPort, RecoveryActionReserveResult } from "./recoveryActionRecord";
import type { RecoveryLease, RecoveryLeaseAcquireResult, RecoveryLeasePort } from "./recoveryLease";
import { createRecoveryActiveCoordinator } from "./recoveryActiveCoordinator";

const request: RecoveryActionRequest = {
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component",
  requestedAt: "2026-09-08T00:00:00.000Z",
  correlationId: "decision-1",
};

const config: ActiveRecoveryConfig = {
  enabled: true,
  environment: "homologation-controlled",
  authorizedEnvironment: "homologation-controlled",
  authorizedComponent: "database",
  authorizedAction: "restart_component",
  leaseNamespace: "d011b3-v1",
};

const lease: RecoveryLease = {
  leaseId: "lease-1",
  namespace: "d011b3-v1",
  componentId: "database",
  actionId: request.actionId,
  ownerId: "replica-a",
  fencingToken: 11,
  acquiredAt: "2026-09-08T00:00:00.000Z",
  expiresAt: "2026-09-08T00:00:30.000Z",
};

const reservedRecord: RecoveryActionRecord = {
  actionId: request.actionId,
  componentId: request.componentId,
  correlationId: request.correlationId,
  action: request.action,
  state: "reserved",
  fencingToken: lease.fencingToken,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

function createPorts(options: {
  acquire?: RecoveryLeaseAcquireResult;
  reserve?: RecoveryActionReserveResult;
  fenceValid?: boolean;
} = {}) {
  const order: string[] = [];
  const release = vi.fn(async () => { order.push("release"); });
  const leasePort: RecoveryLeasePort = {
    acquire: vi.fn(async () => {
      order.push("acquire");
      return options.acquire ?? { acquired: true, lease };
    }),
    validateFence: vi.fn(async () => {
      order.push("validateFence");
      return options.fenceValid ?? true;
    }),
    release,
  };
  const recordPort: RecoveryActionRecordPort = {
    reserve: vi.fn(async () => {
      order.push("reserve");
      return options.reserve ?? { status: "reserved", record: reservedRecord };
    }),
    updateState: vi.fn(async () => true),
    get: vi.fn(async () => null),
  };
  return { leasePort, recordPort, order, release };
}

function coordinator(ports: ReturnType<typeof createPorts>, overrideConfig = config) {
  return createRecoveryActiveCoordinator({
    config: overrideConfig,
    leasePort: ports.leasePort,
    recordPort: ports.recordPort,
    ownerId: "replica-a",
    leaseTtlMs: 30_000,
    now: () => new Date("2026-09-08T00:00:00.000Z"),
  });
}

describe("RecoveryActiveCoordinator", () => {
  it("stops before lease when authorization is disabled", async () => {
    const ports = createPorts();
    const result = await coordinator(ports, { ...config, enabled: false }).prepare(request);
    expect(result).toEqual({ allowedToReachFutureAdapter: false, reasonCode: "AUTHORIZATION_DENIED" });
    expect(ports.leasePort.acquire).not.toHaveBeenCalled();
  });

  it("stops before reservation when lease backend is unavailable", async () => {
    const ports = createPorts({ acquire: { acquired: false, reasonCode: "LEASE_BACKEND_UNAVAILABLE" } });
    const result = await coordinator(ports).prepare(request);
    expect(result.reasonCode).toBe("LEASE_BACKEND_UNAVAILABLE");
    expect(ports.recordPort.reserve).not.toHaveBeenCalled();
  });

  it("stops before reservation when another owner holds the lease", async () => {
    const ports = createPorts({ acquire: { acquired: false, reasonCode: "LEASE_HELD" } });
    const result = await coordinator(ports).prepare(request);
    expect(result.reasonCode).toBe("LEASE_DENIED");
    expect(ports.recordPort.reserve).not.toHaveBeenCalled();
  });

  it.each([
    ["store_unavailable", "ACTION_STORE_UNAVAILABLE"],
    ["conflict", "ACTION_CONFLICT"],
    ["existing_non_terminal", "ACTION_ALREADY_IN_PROGRESS"],
    ["existing_terminal", "ACTION_DUPLICATE_TERMINAL"],
  ] as const)("releases the lease for reserve outcome %s", async (status, reasonCode) => {
    const record = status === "existing_terminal"
      ? { ...reservedRecord, state: "completed_success" as const }
      : { ...reservedRecord, state: "executing" as const };
    const reserve = status === "store_unavailable" || status === "conflict"
      ? { status }
      : { status, record };
    const ports = createPorts({ reserve: reserve as RecoveryActionReserveResult });
    const result = await coordinator(ports).prepare(request);
    expect(result.reasonCode).toBe(reasonCode);
    expect(ports.release).toHaveBeenCalledWith(lease);
    expect(ports.leasePort.validateFence).not.toHaveBeenCalled();
  });

  it("releases and fails closed when the fence is stale after reservation", async () => {
    const ports = createPorts({ fenceValid: false });
    const result = await coordinator(ports).prepare(request);
    expect(result).toEqual({ allowedToReachFutureAdapter: false, reasonCode: "FENCE_INVALID" });
    expect(ports.release).toHaveBeenCalledWith(lease);
  });

  it("prepares in exact acquire -> reserve -> validateFence order without executing an adapter", async () => {
    const ports = createPorts();
    const result = await coordinator(ports).prepare(request);
    expect(ports.order).toEqual(["acquire", "reserve", "validateFence"]);
    expect(result).toEqual({
      allowedToReachFutureAdapter: true,
      reasonCode: "AUTHORIZED_AND_RESERVED",
      fencingToken: 11,
    });
    expect(Object.keys(result).sort()).toEqual([
      "allowedToReachFutureAdapter",
      "fencingToken",
      "reasonCode",
    ]);
  });
});
