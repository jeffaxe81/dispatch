import { describe, expect, it } from "vitest";
import {
  createRecoveryPolicyEngine,
  type RecoveryPolicyConfig,
  type RecoveryTransitionInput,
} from "./recoveryPolicy";
import { createInMemoryRecoveryPolicyStore } from "./recoveryPolicyStore";

const defaultConfig: RecoveryPolicyConfig = {
  enabled: true,
  recoverableComponents: new Set(["database"]),
  cooldownMs: 30_000,
  attemptWindowMs: 15 * 60_000,
  maxAttempts: 3,
  healthyCyclesToCloseCircuit: 2,
};

const baseTransition: RecoveryTransitionInput = {
  transitionId: "tr-1",
  componentId: "database",
  from: "healthy",
  to: "unhealthy",
  criticality: "critical",
  occurredAt: "2026-09-07T12:00:00.000Z",
};

function createEngine(overrides: Partial<RecoveryPolicyConfig> = {}) {
  let id = 0;
  return createRecoveryPolicyEngine({
    store: createInMemoryRecoveryPolicyStore(),
    config: { ...defaultConfig, ...overrides },
    createId: () => `decision-${++id}`,
  });
}

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
      lastTransitionId: null,
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

  it("allows an unhealthy allowlisted component in dry-run mode", () => {
    expect(createEngine().evaluate(baseTransition, now)).toMatchObject({
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
        { ...baseTransition, transitionId: "tr-2", componentId: "storage" },
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
      const from = to === "healthy" ? "unhealthy" : "healthy";
      expect(
        createEngine().evaluate(
          { ...baseTransition, transitionId: `tr-${to}`, from, to },
          now,
        ),
      ).toMatchObject({
        decision: "suppress",
        reasonCode: "STATE_NOT_RECOVERABLE",
      });
    },
  );

  it("fails closed when policy is disabled", () => {
    expect(createEngine({ enabled: false }).evaluate(baseTransition, now)).toMatchObject({
      decision: "suppress",
      reasonCode: "POLICY_DISABLED",
    });
  });

  it("rejects invalid transitions where from equals to", () => {
    expect(
      createEngine().evaluate(
        { ...baseTransition, from: "unhealthy", to: "unhealthy" },
        now,
      ),
    ).toMatchObject({
      decision: "suppress",
      reasonCode: "INVALID_TRANSITION",
    });
  });
});

describe("RecoveryPolicyEngine limits", () => {
  const t0 = new Date("2026-09-07T12:00:00.000Z");
  const t10 = new Date("2026-09-07T12:00:10.000Z");
  const t31 = new Date("2026-09-07T12:00:31.000Z");
  const t62 = new Date("2026-09-07T12:01:02.000Z");
  const t93 = new Date("2026-09-07T12:01:33.000Z");
  const t124 = new Date("2026-09-07T12:02:04.000Z");

  function input(transitionId: string): RecoveryTransitionInput {
    return { ...baseTransition, transitionId };
  }

  it("enforces cooldown, three allowed attempts, then opens recovery circuit", () => {
    const store = createInMemoryRecoveryPolicyStore();
    let id = 0;
    const engine = createRecoveryPolicyEngine({
      store,
      config: defaultConfig,
      createId: () => `limit-${++id}`,
    });

    expect(engine.evaluate(input("tr-1"), t0)).toMatchObject({
      decision: "allow_dry_run",
      attemptNumber: 1,
    });
    expect(engine.evaluate(input("cooldown-1"), t10)).toMatchObject({
      decision: "suppress",
      reasonCode: "COOLDOWN_ACTIVE",
      attemptNumber: 1,
    });
    expect(engine.evaluate(input("tr-2"), t31)).toMatchObject({
      decision: "allow_dry_run",
      attemptNumber: 2,
    });
    expect(engine.evaluate(input("tr-3"), t62)).toMatchObject({
      decision: "allow_dry_run",
      attemptNumber: 3,
    });
    expect(engine.evaluate(input("tr-4"), t93)).toMatchObject({
      decision: "escalate",
      reasonCode: "ATTEMPT_LIMIT_REACHED",
      attemptNumber: 3,
    });
    expect(store.get("database").circuitOpen).toBe(true);

    expect(engine.evaluate(input("tr-5"), t124)).toMatchObject({
      decision: "suppress",
      reasonCode: "RECOVERY_CIRCUIT_OPEN",
      attemptNumber: 3,
    });
    expect(store.get("database").attemptTimestamps).toHaveLength(3);
  });

  it("prunes attempts outside the rolling window", () => {
    const store = createInMemoryRecoveryPolicyStore();
    let id = 0;
    const engine = createRecoveryPolicyEngine({
      store,
      config: defaultConfig,
      createId: () => `window-${++id}`,
    });

    expect(engine.evaluate(input("old-1"), t0).decision).toBe("allow_dry_run");
    const afterWindow = new Date(t0.getTime() + defaultConfig.attemptWindowMs + 31_000);
    expect(engine.evaluate(input("new-1"), afterWindow)).toMatchObject({
      decision: "allow_dry_run",
      attemptNumber: 1,
    });
    expect(store.get("database").attemptTimestamps).toHaveLength(1);
  });
});

describe("RecoveryPolicyEngine idempotency and circuit recovery", () => {
  const t0 = new Date("2026-09-07T12:00:00.000Z");
  const t31 = new Date("2026-09-07T12:00:31.000Z");
  const t62 = new Date("2026-09-07T12:01:02.000Z");
  const t93 = new Date("2026-09-07T12:01:33.000Z");
  const h1 = new Date("2026-09-07T12:02:04.000Z");
  const h2 = new Date("2026-09-07T12:02:05.000Z");

  it("suppresses a duplicate transition without adding an attempt", () => {
    const store = createInMemoryRecoveryPolicyStore();
    let id = 0;
    const engine = createRecoveryPolicyEngine({
      store,
      config: defaultConfig,
      createId: () => `duplicate-${++id}`,
    });

    expect(engine.evaluate({ ...baseTransition, transitionId: "dup-1" }, t0)).toMatchObject({
      decision: "allow_dry_run",
      attemptNumber: 1,
    });
    expect(engine.evaluate({ ...baseTransition, transitionId: "dup-1" }, t31)).toMatchObject({
      decision: "suppress",
      reasonCode: "DUPLICATE_TRANSITION",
      attemptNumber: 1,
    });
    expect(store.get("database").attemptTimestamps).toHaveLength(1);
  });

  it("closes an open circuit only after two consecutive healthy observations", () => {
    const store = createInMemoryRecoveryPolicyStore();
    let id = 0;
    const engine = createRecoveryPolicyEngine({
      store,
      config: defaultConfig,
      createId: () => `healthy-${++id}`,
    });
    const unhealthy = (transitionId: string): RecoveryTransitionInput => ({
      ...baseTransition,
      transitionId,
    });
    const healthy = (transitionId: string): RecoveryTransitionInput => ({
      ...baseTransition,
      transitionId,
      from: "unhealthy",
      to: "healthy",
    });

    engine.evaluate(unhealthy("open-1"), t0);
    engine.evaluate(unhealthy("open-2"), t31);
    engine.evaluate(unhealthy("open-3"), t62);
    engine.evaluate(unhealthy("open-4"), t93);
    expect(store.get("database").circuitOpen).toBe(true);

    expect(engine.evaluate(healthy("h-1"), h1)).toMatchObject({
      decision: "suppress",
      reasonCode: "STATE_NOT_RECOVERABLE",
    });
    expect(store.get("database").circuitOpen).toBe(true);
    expect(store.get("database").healthyStreak).toBe(1);

    expect(engine.evaluate(healthy("h-2"), h2)).toMatchObject({
      decision: "suppress",
      reasonCode: "STATE_NOT_RECOVERABLE",
    });
    expect(store.get("database").circuitOpen).toBe(false);
    expect(store.get("database").healthyStreak).toBe(0);
    expect(store.get("database").attemptTimestamps).toHaveLength(0);
    expect(store.get("database").cooldownUntilMs).toBeNull();
  });

  it("resets healthy streak when a non-healthy observation interrupts recovery", () => {
    const store = createInMemoryRecoveryPolicyStore();
    let id = 0;
    const engine = createRecoveryPolicyEngine({
      store,
      config: defaultConfig,
      createId: () => `reset-${++id}`,
    });
    const state = store.get("database");
    store.set("database", { ...state, circuitOpen: true, healthyStreak: 1 });

    engine.evaluate(
      { ...baseTransition, transitionId: "interrupt", from: "healthy", to: "unknown" },
      h1,
    );
    expect(store.get("database").healthyStreak).toBe(0);
  });
});
