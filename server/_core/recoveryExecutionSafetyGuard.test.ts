import { describe, expect, it, vi } from "vitest";
import type { ActiveRecoveryConfig } from "./activeRecoveryAuthorization";
import type { RecoveryActionRecordPort } from "./recoveryActionRecord";
import type { RecoveryLease, RecoveryLeasePort } from "./recoveryLease";
import type { RecoveryExecutionRequest } from "./recoveryExecution";
import { createRecoveryExecutionSafetyGuard } from "./recoveryExecutionSafetyGuard";

const now = new Date("2026-09-08T12:00:10.000Z");

const config = (enabled = true): ActiveRecoveryConfig => ({
  enabled,
  environment: "homologation-controlled",
  authorizedEnvironment: "homologation-controlled",
  authorizedComponent: "database",
  authorizedAction: "restart_component",
  leaseNamespace: "d011b3-v1",
});

const request = (): RecoveryExecutionRequest => ({
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
  ownerId: "instance-a",
  fencingToken: 7,
  authorizationRef: "auth:decision-1",
  deadlineAt: "2026-09-08T12:00:30.000Z",
});

const lease = (): RecoveryLease => ({
  leaseId: "lease-1",
  namespace: "d011b3-v1",
  componentId: "database",
  actionId: "action:decision-1",
  ownerId: "instance-a",
  fencingToken: 7,
  acquiredAt: "2026-09-08T12:00:00.000Z",
  expiresAt: "2026-09-08T12:00:20.000Z",
});

function ports() {
  const leasePort: RecoveryLeasePort = {
    acquire: vi.fn(),
    validateFence: vi.fn(async () => true),
    release: vi.fn(async () => undefined),
  };
  const recordPort: RecoveryActionRecordPort = {
    reserve: vi.fn(),
    updateState: vi.fn(),
    get: vi.fn(async () => ({
      actionId: "action:decision-1",
      componentId: "database",
      correlationId: "decision-1",
      action: "restart_component",
      state: "reserved",
      fencingToken: 7,
      createdAt: "2026-09-08T12:00:01.000Z",
      updatedAt: "2026-09-08T12:00:01.000Z",
    })),
  };
  return { leasePort, recordPort };
}

function guard(overrides: Partial<{
  activeConfig: ActiveRecoveryConfig;
  leasePort: RecoveryLeasePort;
  recordPort: RecoveryActionRecordPort;
}> = {}) {
  const defaults = ports();
  return createRecoveryExecutionSafetyGuard({
    activeConfig: overrides.activeConfig ?? config(),
    leasePort: overrides.leasePort ?? defaults.leasePort,
    recordPort: overrides.recordPort ?? defaults.recordPort,
    now: () => now,
  });
}

describe("D-011B.4 execution safety guard", () => {
  it("allows only a fully-bound current simulated execution", async () => {
    await expect(guard().evaluate({ request: request(), lease: lease(), executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: true, reasonCode: "EXECUTION_ALLOWED" });
  });

  it("fails closed when the kill switch is off", async () => {
    await expect(guard({ activeConfig: config(false) }).evaluate({ request: request(), lease: lease(), executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "KILL_SWITCH_OFF" });
  });

  it("fails closed when authorization no longer allows the component", async () => {
    const deniedConfig = { ...config(), authorizedComponent: "storage" as any };
    await expect(guard({ activeConfig: deniedConfig }).evaluate({ request: request(), lease: lease(), executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "AUTHORIZATION_DENIED" });
  });

  it("rejects a request that is not bound to its persistent reservation", async () => {
    await expect(guard().evaluate({ request: { ...request(), reservationId: "other-action" }, lease: lease(), executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "RESERVATION_MISMATCH" });
  });

  it("rejects an expired lease before consulting the fence backend", async () => {
    const p = ports();
    const staleLease = { ...lease(), expiresAt: "2026-09-08T12:00:05.000Z" };
    await expect(guard({ leasePort: p.leasePort, recordPort: p.recordPort }).evaluate({ request: request(), lease: staleLease, executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "STALE_LEASE" });
    expect(p.leasePort.validateFence).not.toHaveBeenCalled();
  });

  it("rejects owner mismatch", async () => {
    await expect(guard().evaluate({ request: request(), lease: { ...lease(), ownerId: "instance-b" }, executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "OWNER_MISMATCH" });
  });

  it("rejects fencing mismatch", async () => {
    await expect(guard().evaluate({ request: request(), lease: { ...lease(), fencingToken: 8 }, executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "FENCING_MISMATCH" });
  });

  it("rejects unsupported actions before any executor can be reached", async () => {
    await expect(guard().evaluate({ request: { ...request(), action: "restore_database" as any }, lease: lease(), executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "UNSUPPORTED_ACTION" });
  });

  it("rejects real or unknown executor capability structurally", async () => {
    await expect(guard().evaluate({ request: request(), lease: lease(), executorCapability: "real" as any }))
      .resolves.toEqual({ allowed: false, reasonCode: "REAL_EXECUTOR_FORBIDDEN" });
  });

  it("fails closed when the persistent reservation cannot be read", async () => {
    const p = ports();
    p.recordPort.get = vi.fn(async () => { throw new Error("db details must not leak"); });
    await expect(guard({ leasePort: p.leasePort, recordPort: p.recordPort }).evaluate({ request: request(), lease: lease(), executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "ACTION_STORE_UNAVAILABLE" });
  });

  it("fails closed when the current fence is no longer valid", async () => {
    const p = ports();
    p.leasePort.validateFence = vi.fn(async () => false);
    await expect(guard({ leasePort: p.leasePort, recordPort: p.recordPort }).evaluate({ request: request(), lease: lease(), executorCapability: "simulation" }))
      .resolves.toEqual({ allowed: false, reasonCode: "STALE_LEASE" });
  });
});
