import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecoveryActionRecord, RecoveryActionRecordPort, RecoveryExecutionLedgerPort } from "./recoveryActionRecord";
import type { RecoveryExecutionRequest } from "./recoveryExecution";
import type { RecoveryExecutionAuditPort } from "./recoveryExecutionAudit";
import type { RecoveryLease, RecoveryLeasePort } from "./recoveryLease";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (request: { actionId: string; componentId: string; correlationId: string }) => ({
    actionId: request.actionId,
    componentId: request.componentId,
    status: "simulated_success" as const,
    reasonCode: "SIMULATED_SUCCESS" as const,
    startedAt: "2026-09-08T12:00:02.000Z",
    finishedAt: "2026-09-08T12:00:03.000Z",
    durationMs: 1_000,
    correlationId: request.correlationId,
  })),
}));

vi.mock("./simulatedRecoveryAdapter", () => ({
  createSimulatedRecoveryAdapter: vi.fn(() => ({ execute: mocks.execute })),
}));

import { createActiveRecoveryBootstrap } from "./activeRecoveryBootstrap";

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
  deadlineAt: "2099-09-08T12:01:00.000Z",
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
  expiresAt: "2099-09-08T12:01:00.000Z",
};

function executionPorts() {
  let record: RecoveryActionRecord = {
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
  const leasePort: RecoveryLeasePort = {
    acquire: vi.fn(),
    validateFence: vi.fn(async () => true),
    release: vi.fn(),
  };
  const recordPort: RecoveryActionRecordPort = {
    reserve: vi.fn(),
    updateState: vi.fn(),
    get: vi.fn(async () => record),
  };
  const ledger: RecoveryExecutionLedgerPort = {
    get: vi.fn(async () => record),
    compareAndSetState: vi.fn(async input => {
      if (record.state !== input.expectedState) return { status: "state_conflict" as const, record };
      record = { ...record, state: input.nextState, updatedAt: input.at };
      return { status: "transitioned" as const, record };
    }),
  };
  const audit: RecoveryExecutionAuditPort = {
    append: vi.fn(async () => undefined),
  };
  return { leasePort, recordPort, ledger, audit };
}

describe("D-011B.4 bootstrap cooperative cancellation wiring", () => {
  beforeEach(() => mocks.execute.mockClear());

  it("forwards the boundary AbortSignal to the simulated action port", async () => {
    const bootstrap = createActiveRecoveryBootstrap({
      config: {
        enabled: true,
        environment: "homologation-controlled",
        authorizedEnvironment: "homologation-controlled",
        authorizedComponent: "database",
        authorizedAction: "restart_component",
        leaseNamespace: "d011b3-v1",
      },
      execution: executionPorts(),
    });

    await bootstrap.executionBoundary!.execute({ request, lease });

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: request.actionId }),
      expect.any(AbortSignal),
    );
  });
});
