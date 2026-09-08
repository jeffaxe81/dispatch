import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { authorizeRecoveryAction } from "./activeRecoveryAuthorization";
import type { RecoveryActionRecord, RecoveryActionRecordPort, RecoveryExecutionLedgerPort } from "./recoveryActionRecord";
import { createActiveRecoveryBootstrap } from "./activeRecoveryBootstrap";
import type { RecoveryExecutionRequest } from "./recoveryExecution";
import type { RecoveryExecutionAuditPort } from "./recoveryExecutionAudit";
import type { RecoveryLease, RecoveryLeasePort } from "./recoveryLease";

const request = {
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-08T00:00:00.000Z",
  correlationId: "decision-1",
};

const tenantId = "tenant-7";

const lease: RecoveryLease = {
  leaseId: "lease-1",
  namespace: "d011b3-v1",
  tenantId,
  componentId: request.componentId,
  actionId: request.actionId,
  ownerId: "replica-a",
  fencingToken: 7,
  acquiredAt: "2026-09-08T00:00:00.000Z",
  expiresAt: "2099-09-08T00:00:30.000Z",
};

const executionRequest: RecoveryExecutionRequest = {
  tenantId,
  ...request,
  reservationId: request.actionId,
  leaseId: lease.leaseId,
  leaseNamespace: lease.namespace,
  ownerId: lease.ownerId,
  fencingToken: lease.fencingToken,
  authorizationRef: "auth:decision-1",
  deadlineAt: "2099-09-08T00:00:30.000Z",
};

function executionPorts() {
  let record: RecoveryActionRecord = {
    actionId: request.actionId,
    tenantId,
    componentId: request.componentId,
    correlationId: request.correlationId,
    action: request.action,
    state: "reserved",
    fencingToken: lease.fencingToken,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
  const leasePort: RecoveryLeasePort = {
    acquire: async () => ({ acquired: true, lease }),
    validateFence: async () => true,
    release: async () => undefined,
  };
  const recordPort: RecoveryActionRecordPort = {
    reserve: async () => ({ status: "reserved", record }),
    updateState: async () => true,
    get: async () => record,
  };
  const ledger: RecoveryExecutionLedgerPort = {
    get: async () => record,
    compareAndSetState: async input => {
      if (record.fencingToken !== input.expectedFencingToken) {
        return { status: "fencing_conflict", record };
      }
      if (record.state !== input.expectedState) {
        return { status: "state_conflict", record };
      }
      record = { ...record, state: input.nextState, updatedAt: input.at };
      return { status: "transitioned", record };
    },
  };
  const audit: RecoveryExecutionAuditPort = {
    append: vi.fn(async () => undefined),
  };
  return { leasePort, recordPort, ledger, audit };
}

describe("createActiveRecoveryBootstrap", () => {
  it("is disabled by default and scoped to homologation/database/restart", () => {
    const bootstrap = createActiveRecoveryBootstrap();
    expect(bootstrap.config).toEqual({
      enabled: false,
      environment: "homologation-controlled",
      authorizedEnvironment: "homologation-controlled",
      authorizedComponent: "database",
      authorizedAction: "restart_component",
      leaseNamespace: "d011b3-v1",
    });
  });

  it("keeps the runtime action port simulation-only", async () => {
    const bootstrap = createActiveRecoveryBootstrap();
    const result = await bootstrap.actionPort.execute(request);
    expect(result.status).toBe("simulated_success");
    expect(result.reasonCode).toBe("SIMULATED_SUCCESS");
  });

  it("wires the D-011B.4 boundary only to the internal simulated executor when authoritative coordination ports are supplied", async () => {
    const ports = executionPorts();
    const bootstrap = createActiveRecoveryBootstrap({
      config: {
        enabled: true,
        environment: "homologation-controlled",
        authorizedEnvironment: "homologation-controlled",
        authorizedComponent: "database",
        authorizedAction: "restart_component",
        leaseNamespace: "d011b3-v1",
      },
      execution: ports,
    });
    expect(bootstrap.executionBoundary).toBeDefined();
    const result = await bootstrap.executionBoundary!.execute({
      request: executionRequest,
      lease,
    });
    expect(result).toMatchObject({ status: "executed", reasonCode: "SIMULATED_SUCCESS" });
    expect(ports.audit.append).toHaveBeenCalledTimes(1);
  });

  it("does not expose an execution boundary when authoritative coordination ports are absent", () => {
    expect(createActiveRecoveryBootstrap().executionBoundary).toBeUndefined();
  });

  it("never authorizes production", () => {
    const bootstrap = createActiveRecoveryBootstrap({
      config: {
        enabled: true,
        environment: "production",
        authorizedEnvironment: "homologation-controlled",
        authorizedComponent: "database",
        authorizedAction: "restart_component",
        leaseNamespace: "d011b3-v1",
      },
    });
    expect(authorizeRecoveryAction({ request, config: bootstrap.config })).toMatchObject({
      authorized: false,
      reasonCode: "ENVIRONMENT_NOT_AUTHORIZED",
    });
  });

  it("does not introduce execution primitives, remote hooks, or an env enable knob", () => {
    const source = readFileSync(new URL("./activeRecoveryBootstrap.ts", import.meta.url), "utf8");
    for (const forbidden of [
      "child_process",
      "exec(",
      "spawn(",
      "systemctl",
      "docker",
      "kubernetes",
      "ACTIVE_RECOVERY_ENABLED",
      "express",
      "router",
      "trpc",
    ]) {
      expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
