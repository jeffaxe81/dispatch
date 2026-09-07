import { describe, expect, it } from "vitest";
import {
  createRecoveryPolicyEngine,
  type RecoveryPolicyConfig,
  type RecoveryTransitionInput,
} from "./recoveryPolicy";
import { createInMemoryRecoveryPolicyStore } from "./recoveryPolicyStore";

describe("RecoveryPolicyStore", () => {
  it("isolates state per component and returns fail-closed defaults", () => {
    const store = createInMemoryRecoveryPolicyStore();
    const db = store.get("database");
    const storage = store.get("storage");

    expect(db).toEqual({
      attemptTimestamps: [],
      cooldownUntilMs: null,
      circuitOpen: false,
      healthyStreak: 0,
      lastDecisionId: null,
      inProgress: false,
    });
    expect(storage).toEqual(db);

    store.set("database", { ...db, circuitOpen: true });
    expect(store.get("database").circuitOpen).toBe(true);
    expect(store.get("storage").circuitOpen).toBe(false);
  });
});

describe("RecoveryPolicyEngine eligibility", () => {
  const now = new Date("2026-09-07T12:00:00.000Z");
  const config: RecoveryPolicyConfig = {
    enabled: true,
    recoverableComponents: new Set(["database"]),
    cooldownMs: 30_000,
    attemptWindowMs: 15 * 60_000,
    maxAttempts: 3,
    healthyCyclesToCloseCircuit: 2,
  };

  const unhealthyDb: RecoveryTransitionInput = {
    transitionId: "tr-1",
    componentId: "database",
    from: "healthy",
    to: "unhealthy",
    criticality: "critical",
    occurredAt: now.toISOString(),
  };

  function createEngine(overrides: Partial<RecoveryPolicyConfig> = {}) {
    let id = 0;
    return createRecoveryPolicyEngine({
      store: createInMemoryRecoveryPolicyStore(),
      config: { ...config, ...overrides },
      createId: () => `decision-${++id}`,
    });
  }

  it("allows an unhealthy allowlisted component in dry-run mode", () => {
    expect(createEngine().evaluate(unhealthyDb, now)).toMatchObject({
      decision: "allow_dry_run",
      reasonCode: "UNHEALTHY_ELIGIBLE",
      componentId: "database",
      policyVersion: "d011b1-v1",
      attemptNumber: 1,
    });
  });

  it("suppresses components outside the recovery allowlist", () => {
    expect(
      createEngine().evaluate(
        { ...unhealthyDb, transitionId: "tr-2", componentId: "storage" },
        now,
      ),
    ).toMatchObject({
      decision: "suppress",
      reasonCode: "COMPONENT_NOT_ALLOWLISTED",
    });
  });

  it.each(["degraded", "unknown", "healthy"] as const)(
    "suppresses non-recoverable target state %s",
    to => {
      expect(
        createEngine().evaluate({ ...unhealthyDb, transitionId: `tr-${to}`, to }, now),
      ).toMatchObject({
        decision: "suppress",
        reasonCode: "STATE_NOT_RECOVERABLE",
      });
    },
  );

  it("fails closed when policy is disabled", () => {
    expect(createEngine({ enabled: false }).evaluate(unhealthyDb, now)).toMatchObject({
      decision: "suppress",
      reasonCode: "POLICY_DISABLED",
    });
  });

  it("rejects invalid transitions where from equals to", () => {
    expect(
      createEngine().evaluate({ ...unhealthyDb, from: "unhealthy", to: "unhealthy" }, now),
    ).toMatchObject({
      decision: "suppress",
      reasonCode: "INVALID_TRANSITION",
    });
  });
});
