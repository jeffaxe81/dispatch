import { describe, expect, it } from "vitest";
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
