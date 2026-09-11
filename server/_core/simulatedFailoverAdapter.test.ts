import { describe, expect, it } from "vitest";
import type { FailoverPlan } from "./failoverPlanner";
import { createSimulatedFailoverAdapter } from "./simulatedFailoverAdapter";

function makePlan(overrides: Partial<FailoverPlan> = {}): FailoverPlan {
  return Object.freeze({
    planId: "plan-001",
    planVersion: "d011c2-v1",
    tenantId: "tenant-a",
    componentId: "database",
    sourceNodeId: "node-a",
    targetNodeId: "node-b",
    topologyId: "topology-001",
    topologyGeneration: 7,
    fencingToken: 11,
    healthEvidenceRefs: Object.freeze(["health-a", "health-b"]),
    createdAt: "2026-09-10T20:00:00.000Z",
    expiresAt: "2026-09-10T20:01:00.000Z",
    mode: "simulation",
    ...overrides,
  });
}

describe("D-011C.3 simulated failover adapter", () => {
  it("returns deterministic simulated success while preserving plan identity", async () => {
    const adapter = createSimulatedFailoverAdapter({
      mode: "success",
      now: () => new Date("2026-09-10T20:00:10.000Z"),
    });

    await expect(adapter.execute(makePlan())).resolves.toEqual({
      planId: "plan-001",
      sourceNodeId: "node-a",
      targetNodeId: "node-b",
      status: "simulated_success",
      reasonCode: "FAILOVER_SIMULATED_SUCCESS",
      startedAt: "2026-09-10T20:00:10.000Z",
      finishedAt: "2026-09-10T20:00:10.000Z",
    });
  });

  it("exposes only the simulation capability", () => {
    const adapter = createSimulatedFailoverAdapter({ mode: "success" });

    expect(adapter.capability).toEqual({
      kind: "failover-simulation",
      version: "d011c3-v1",
    });
    expect(Object.isFrozen(adapter.capability)).toBe(true);
  });

  it("rejects an expired plan without simulating success", async () => {
    const adapter = createSimulatedFailoverAdapter({
      mode: "success",
      now: () => new Date("2026-09-10T20:01:00.000Z"),
    });

    await expect(adapter.execute(makePlan())).resolves.toMatchObject({
      status: "simulated_rejected",
      reasonCode: "PLAN_EXPIRED",
    });
  });

  it.each([
    ["blank plan id", { planId: "" }],
    ["same source and target", { targetNodeId: "node-a" }],
    ["zero topology generation", { topologyGeneration: 0 }],
    ["fractional fencing token", { fencingToken: 1.5 }],
    ["invalid mode", { mode: "live" as never }],
  ])("rejects malformed plan identity: %s", async (_name, overrides) => {
    const adapter = createSimulatedFailoverAdapter({
      mode: "success",
      now: () => new Date("2026-09-10T20:00:10.000Z"),
    });

    await expect(adapter.execute(makePlan(overrides))).resolves.toMatchObject({
      status: "simulated_rejected",
      reasonCode: "PLAN_MISMATCH",
    });
  });

  it("returns a simulated failure when configured for failure", async () => {
    const adapter = createSimulatedFailoverAdapter({
      mode: "failure",
      now: () => new Date("2026-09-10T20:00:10.000Z"),
    });

    await expect(adapter.execute(makePlan())).resolves.toMatchObject({
      planId: "plan-001",
      sourceNodeId: "node-a",
      targetNodeId: "node-b",
      status: "simulated_failure",
      reasonCode: "SIMULATION_FAILURE",
    });
  });

  it("never returns finishedAt before startedAt", async () => {
    const times = [
      new Date("2026-09-10T20:00:10.000Z"),
      new Date("2026-09-10T20:00:11.000Z"),
    ];
    const adapter = createSimulatedFailoverAdapter({
      mode: "success",
      now: () => times.shift() ?? new Date("2026-09-10T20:00:11.000Z"),
    });

    const result = await adapter.execute(makePlan());

    expect(Date.parse(result.finishedAt)).toBeGreaterThanOrEqual(Date.parse(result.startedAt));
  });
});
