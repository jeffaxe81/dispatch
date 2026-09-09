import { describe, expect, it } from "vitest";
import {
  commitRecoveryActionStateTransition,
  type RecoveryActionRecord,
  type RecoveryExecutionLedgerPort,
} from "./recoveryActionRecord";

function atomicFake(initial: RecoveryActionRecord): RecoveryExecutionLedgerPort {
  let current = initial;
  return {
    get: async () => current,
    compareAndSetState: async input => {
      if (current.tenantId !== input.expectedTenantId) {
        return { status: "tenant_conflict", record: current };
      }
      if (current.fencingToken !== input.expectedFencingToken) {
        return { status: "fencing_conflict", record: current };
      }
      if (current.state !== input.expectedState) {
        return { status: "state_conflict", record: current };
      }
      current = { ...current, state: input.nextState, updatedAt: input.at };
      return { status: "transitioned", record: current };
    },
  };
}

const reserved: RecoveryActionRecord = {
  actionId: "action:decision-1",
  tenantId: "tenant-7",
  componentId: "database",
  correlationId: "decision-1",
  action: "restart_component",
  state: "reserved",
  fencingToken: 7,
  createdAt: "2026-09-08T12:00:00.000Z",
  updatedAt: "2026-09-08T12:00:01.000Z",
};

describe("D-011B.4 atomic recovery execution ledger CAS", () => {
  it("allows only one winner when two callers concurrently claim reserved -> executing", async () => {
    const port = atomicFake(reserved);
    const input = {
      actionId: reserved.actionId,
      expectedTenantId: reserved.tenantId,
      expectedState: "reserved" as const,
      expectedFencingToken: 7,
      nextState: "executing" as const,
      at: "2026-09-08T12:00:02.000Z",
    };

    const results = await Promise.all([
      commitRecoveryActionStateTransition(port, input),
      commitRecoveryActionStateTransition(port, input),
    ]);

    expect(results.filter(result => result.status === "transitioned")).toHaveLength(1);
    expect(results.filter(result => result.status === "state_conflict")).toHaveLength(1);
  });

  it("rejects a same-action and same-fence claim from another tenant atomically", async () => {
    const port = atomicFake(reserved);
    const result = await commitRecoveryActionStateTransition(port, {
      actionId: reserved.actionId,
      expectedTenantId: "tenant-8",
      expectedState: "reserved",
      expectedFencingToken: 7,
      nextState: "executing",
      at: "2026-09-08T12:00:02.000Z",
    });

    expect(result).toEqual({ status: "tenant_conflict", record: reserved });
  });

  it("does not emulate CAS with a read followed by a legacy update", async () => {
    let getCalls = 0;
    const port: RecoveryExecutionLedgerPort = {
      get: async () => {
        getCalls += 1;
        return reserved;
      },
      compareAndSetState: async input => ({
        status: "transitioned",
        record: { ...reserved, state: input.nextState, updatedAt: input.at },
      }),
    };

    const result = await commitRecoveryActionStateTransition(port, {
      actionId: reserved.actionId,
      expectedTenantId: reserved.tenantId,
      expectedState: "reserved",
      expectedFencingToken: 7,
      nextState: "executing",
      at: "2026-09-08T12:00:02.000Z",
    });

    expect(result.status).toBe("transitioned");
    expect(getCalls).toBe(0);
  });

  it("fails closed when the CAS store throws", async () => {
    const port: RecoveryExecutionLedgerPort = {
      get: async () => reserved,
      compareAndSetState: async () => { throw new Error("database details must not leak"); },
    };

    await expect(commitRecoveryActionStateTransition(port, {
      actionId: reserved.actionId,
      expectedTenantId: reserved.tenantId,
      expectedState: "reserved",
      expectedFencingToken: 7,
      nextState: "executing",
      at: "2026-09-08T12:00:02.000Z",
    })).resolves.toEqual({ status: "store_unavailable" });
  });
});
