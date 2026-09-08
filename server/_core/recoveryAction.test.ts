import { describe, expect, it } from "vitest";
import { mapDecisionToRecoveryAction } from "./recoveryAction";

const now = new Date("2026-09-08T00:00:00.000Z");
const decision = {
  decisionId: "decision-1",
  componentId: "database",
  decision: "allow_dry_run" as const,
  reasonCode: "UNHEALTHY_ELIGIBLE" as const,
  policyVersion: "d011b1-v1" as const,
  attemptNumber: 1,
  cooldownUntil: null,
  createdAt: now.toISOString(),
};
const transition = {
  transitionId: "transition-1",
  componentId: "database",
  from: "healthy" as const,
  to: "unhealthy" as const,
  criticality: "critical" as const,
  occurredAt: now.toISOString(),
};

describe("RecoveryAction contract", () => {
  it("maps an allowed decision to a closed restart_component intention", () => {
    expect(mapDecisionToRecoveryAction({ decision, transition, now })).toEqual({
      actionId: "action:decision-1",
      transitionId: "transition-1",
      componentId: "database",
      action: "restart_component",
      requestedAt: now.toISOString(),
      correlationId: "decision-1",
    });
  });

  it("fails closed for an unknown component before adapter execution", () => {
    expect(() =>
      mapDecisionToRecoveryAction({
        decision: { ...decision, componentId: "unknown-service" },
        transition: { ...transition, componentId: "unknown-service" },
        now,
      }),
    ).toThrow("UNKNOWN_COMPONENT");
  });

  it("rejects non executable decisions", () => {
    expect(() =>
      mapDecisionToRecoveryAction({
        decision: { ...decision, decision: "suppress" },
        transition,
        now,
      }),
    ).toThrow("RECOVERY_ACTION_NOT_ALLOWED");
  });

  it("rejects a component mismatch", () => {
    expect(() =>
      mapDecisionToRecoveryAction({
        decision,
        transition: { ...transition, componentId: "storage" },
        now,
      }),
    ).toThrow("COMPONENT_MISMATCH");
  });
});
