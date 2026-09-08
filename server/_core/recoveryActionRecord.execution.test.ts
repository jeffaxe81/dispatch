import { describe, expect, it } from "vitest";
import {
  planRecoveryActionStateTransition,
  type RecoveryActionRecord,
} from "./recoveryActionRecord";

const record = (state: RecoveryActionRecord["state"] = "reserved", fencingToken = 7): RecoveryActionRecord => ({
  actionId: "action:decision-1",
  tenantId: "tenant-7",
  componentId: "database",
  correlationId: "decision-1",
  action: "restart_component",
  state,
  fencingToken,
  createdAt: "2026-09-08T12:00:00.000Z",
  updatedAt: "2026-09-08T12:00:01.000Z",
});

describe("D-011B.4 recovery execution ledger transition contract", () => {
  it("allows reserved -> executing with the current fencing token", () => {
    expect(planRecoveryActionStateTransition(record(), {
      expectedTenantId: "tenant-7",
      expectedState: "reserved",
      expectedFencingToken: 7,
      nextState: "executing",
    })).toEqual({ allowed: true, status: "transition" });
  });

  it.each(["completed_success", "completed_failure", "verification_failed", "unknown_outcome"] as const)(
    "allows executing -> %s",
    (nextState) => {
      expect(planRecoveryActionStateTransition(record("executing"), {
        expectedTenantId: "tenant-7",
        expectedState: "executing",
        expectedFencingToken: 7,
        nextState,
      })).toEqual({ allowed: true, status: "transition" });
    },
  );

  it("rejects a transition for a different tenant before state or fencing can match", () => {
    expect(planRecoveryActionStateTransition(record(), {
      expectedTenantId: "tenant-8",
      expectedState: "reserved",
      expectedFencingToken: 7,
      nextState: "executing",
    })).toEqual({ allowed: false, status: "tenant_conflict" });
  });

  it("rejects a stale fencing token", () => {
    expect(planRecoveryActionStateTransition(record("reserved", 8), {
      expectedTenantId: "tenant-7",
      expectedState: "reserved",
      expectedFencingToken: 7,
      nextState: "executing",
    })).toEqual({ allowed: false, status: "fencing_conflict" });
  });

  it("rejects compare-and-set when another caller already advanced the state", () => {
    expect(planRecoveryActionStateTransition(record("executing"), {
      expectedTenantId: "tenant-7",
      expectedState: "reserved",
      expectedFencingToken: 7,
      nextState: "executing",
    })).toEqual({ allowed: false, status: "state_conflict" });
  });

  it("never regresses a terminal state", () => {
    expect(planRecoveryActionStateTransition(record("completed_success"), {
      expectedTenantId: "tenant-7",
      expectedState: "completed_success",
      expectedFencingToken: 7,
      nextState: "executing",
    })).toEqual({ allowed: false, status: "terminal_conflict" });
  });

  it("treats an identical terminal transition as idempotent reuse", () => {
    expect(planRecoveryActionStateTransition(record("completed_failure"), {
      expectedTenantId: "tenant-7",
      expectedState: "completed_failure",
      expectedFencingToken: 7,
      nextState: "completed_failure",
    })).toEqual({ allowed: false, status: "existing_terminal" });
  });

  it("keeps unknown_outcome terminal and non-retryable", () => {
    expect(planRecoveryActionStateTransition(record("unknown_outcome"), {
      expectedTenantId: "tenant-7",
      expectedState: "unknown_outcome",
      expectedFencingToken: 7,
      nextState: "reserved",
    })).toEqual({ allowed: false, status: "terminal_conflict" });
  });

  it("rejects reserved -> terminal because execution must be claimed first", () => {
    expect(planRecoveryActionStateTransition(record("reserved"), {
      expectedState: "reserved",
      expectedFencingToken: 7,
      nextState: "completed_success",
    })).toEqual({ allowed: false, status: "invalid_transition" });
  });
});
