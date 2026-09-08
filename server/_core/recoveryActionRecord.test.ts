import { describe, expect, it } from "vitest";
import {
  isTerminalRecoveryActionState,
  sameRecoveryActionIdentity,
  type RecoveryActionRecord,
  type RecoveryActionReserveResult,
} from "./recoveryActionRecord";

const record: RecoveryActionRecord = {
  actionId: "action:decision-1",
  componentId: "database",
  correlationId: "decision-1",
  action: "restart_component",
  state: "completed_success",
  fencingToken: 7,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:10.000Z",
};

describe("RecoveryActionRecord contract", () => {
  it("recognizes an exact duplicate identity for stored-result reuse", () => {
    expect(sameRecoveryActionIdentity(record, {
      actionId: record.actionId,
      componentId: record.componentId,
      correlationId: record.correlationId,
      action: record.action,
    })).toBe(true);
  });

  it("rejects conflicting identity for the same action id", () => {
    expect(sameRecoveryActionIdentity(record, {
      actionId: record.actionId,
      componentId: "storage",
      correlationId: record.correlationId,
      action: record.action,
    })).toBe(false);
  });

  it("keeps terminal, non-terminal, conflict and store-unavailable reserve outcomes closed", () => {
    const outcomes: RecoveryActionReserveResult[] = [
      { status: "reserved", record: { ...record, state: "reserved" } },
      { status: "existing_terminal", record },
      { status: "existing_non_terminal", record: { ...record, state: "executing" } },
      { status: "conflict" },
      { status: "store_unavailable" },
    ];
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "reserved",
      "existing_terminal",
      "existing_non_terminal",
      "conflict",
      "store_unavailable",
    ]);
  });

  it("treats unknown_outcome as terminal to prevent automatic retry", () => {
    expect(isTerminalRecoveryActionState("unknown_outcome")).toBe(true);
    expect(isTerminalRecoveryActionState("completed_success")).toBe(true);
    expect(isTerminalRecoveryActionState("completed_failure")).toBe(true);
    expect(isTerminalRecoveryActionState("verification_failed")).toBe(true);
    expect(isTerminalRecoveryActionState("reserved")).toBe(false);
    expect(isTerminalRecoveryActionState("executing")).toBe(false);
  });
});
