import { describe, expect, it } from "vitest";
import { mapHealthTransitionToRecoveryInput } from "./recoveryBootstrap";
import {
  createRecoveryPolicyEngine,
  type RecoveryPolicyConfig,
  type RecoveryTransitionInput,
} from "./recoveryPolicy";
import { createInMemoryRecoveryPolicyStore } from "./recoveryPolicyStore";

const config: RecoveryPolicyConfig = {
  enabled: true,
  recoverableComponents: new Set(["database"]),
  cooldownMs: 30_000,
  attemptWindowMs: 15 * 60_000,
  maxAttempts: 3,
  healthyCyclesToCloseCircuit: 2,
};

describe("D-011B.1 confirmed healthy evidence", () => {
  it("closes an open recovery circuit when one watchdog transition represents two confirmed healthy cycles", () => {
    const store = createInMemoryRecoveryPolicyStore();
    const initial = store.get("database");
    store.set("database", {
      ...initial,
      circuitOpen: true,
      attemptTimestamps: [1, 2, 3],
      cooldownUntilMs: 30_000,
    });
    const engine = createRecoveryPolicyEngine({ store, config, createId: () => "decision-1" });
    const input = {
      transitionId: "database:unhealthy:healthy:2026-09-08T00:00:00.000Z",
      componentId: "database",
      from: "unhealthy",
      to: "healthy",
      criticality: "critical",
      occurredAt: "2026-09-08T00:00:00.000Z",
      confirmedHealthyCycles: 2,
    } as RecoveryTransitionInput & { confirmedHealthyCycles: number };

    engine.evaluate(input, new Date(input.occurredAt));

    expect(store.get("database")).toMatchObject({
      circuitOpen: false,
      healthyStreak: 0,
      attemptTimestamps: [],
      cooldownUntilMs: null,
    });
  });

  it("preserves watchdog healthy confirmation count at the recovery boundary", () => {
    const mapWithConfirmations = mapHealthTransitionToRecoveryInput as unknown as (
      transition: {
        componentId: string;
        from: "unhealthy";
        to: "healthy";
        occurredAt: string;
      },
      confirmedHealthyCycles: number,
    ) => RecoveryTransitionInput & { confirmedHealthyCycles?: number };

    const mapped = mapWithConfirmations(
      {
        componentId: "database",
        from: "unhealthy",
        to: "healthy",
        occurredAt: "2026-09-08T00:00:00.000Z",
      },
      2,
    );

    expect(mapped.confirmedHealthyCycles).toBe(2);
  });
});
