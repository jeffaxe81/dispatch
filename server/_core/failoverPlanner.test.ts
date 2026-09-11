import { describe, expect, it } from "vitest";
import { createFailoverPlanner } from "./failoverPlanner";

const now = new Date("2026-09-10T20:00:00.000Z");

function makeValidInput() {
  return {
    topology: {
      topologyId: "topology-001",
      topologyVersion: "d011c1-v1" as const,
      tenantId: "tenant-a",
      componentId: "database",
      generation: 7,
      observedAt: "2026-09-10T19:59:00.000Z",
      nodes: [
        {
          nodeId: "node-a",
          componentId: "database",
          role: "active" as const,
          generation: 7,
          enabled: true,
        },
        {
          nodeId: "node-c",
          componentId: "database",
          role: "standby" as const,
          generation: 7,
          enabled: true,
        },
        {
          nodeId: "node-b",
          componentId: "database",
          role: "standby" as const,
          generation: 7,
          enabled: true,
        },
      ],
    },
    healthEvidence: [
      {
        evidenceId: "health-a",
        tenantId: "tenant-a",
        nodeId: "node-a",
        componentId: "database",
        state: "unhealthy" as const,
        checkedAt: "2026-09-10T19:59:30.000Z",
        validUntil: "2026-09-10T20:00:30.000Z",
      },
      {
        evidenceId: "health-c",
        tenantId: "tenant-a",
        nodeId: "node-c",
        componentId: "database",
        state: "healthy" as const,
        checkedAt: "2026-09-10T19:59:30.000Z",
        validUntil: "2026-09-10T20:00:30.000Z",
      },
      {
        evidenceId: "health-b",
        tenantId: "tenant-a",
        nodeId: "node-b",
        componentId: "database",
        state: "healthy" as const,
        checkedAt: "2026-09-10T19:59:30.000Z",
        validUntil: "2026-09-10T20:00:30.000Z",
      },
    ],
    coordination: {
      tenantId: "tenant-a",
      componentId: "database",
      ownerId: "coordinator-a",
      fencingToken: 11,
      topologyGeneration: 7,
      issuedAt: "2026-09-10T19:59:40.000Z",
      expiresAt: "2026-09-10T20:01:00.000Z",
    },
  };
}

describe("D-011C.2 failover planner", () => {
  it("selects the lexically first safe candidate and binds anti-split-brain context", () => {
    const planner = createFailoverPlanner({
      planTtlMs: 60_000,
      createId: () => "plan-001",
    });

    const result = planner.plan(makeValidInput(), now);

    expect(result).toEqual({
      planned: true,
      reasonCode: "FAILOVER_ELIGIBLE",
      plan: {
        planId: "plan-001",
        planVersion: "d011c2-v1",
        tenantId: "tenant-a",
        componentId: "database",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        topologyId: "topology-001",
        topologyGeneration: 7,
        fencingToken: 11,
        healthEvidenceRefs: ["health-a", "health-b"],
        createdAt: "2026-09-10T20:00:00.000Z",
        expiresAt: "2026-09-10T20:01:00.000Z",
        mode: "simulation",
      },
    });
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid planner ttl %s at construction",
    planTtlMs => {
      expect(() => createFailoverPlanner({ planTtlMs })).toThrow();
    },
  );

  it("returns the eligibility rejection when no safe candidate exists", () => {
    const input = makeValidInput();
    input.healthEvidence[1] = { ...input.healthEvidence[1], state: "unhealthy" };
    input.healthEvidence[2] = { ...input.healthEvidence[2], state: "unhealthy" };

    const planner = createFailoverPlanner({ planTtlMs: 60_000 });

    expect(planner.plan(input, now)).toEqual({
      planned: false,
      reasonCode: "NO_SAFE_CANDIDATE",
    });
  });

  it("propagates expired coordination fail-closed", () => {
    const input = makeValidInput();
    input.coordination.expiresAt = "2026-09-10T19:59:59.000Z";

    const planner = createFailoverPlanner({ planTtlMs: 60_000 });

    expect(planner.plan(input, now)).toEqual({
      planned: false,
      reasonCode: "COORDINATION_EXPIRED",
    });
  });

  it("caps plan expiry at the coordination window", () => {
    const input = makeValidInput();
    input.coordination.expiresAt = "2026-09-10T20:00:20.000Z";

    const planner = createFailoverPlanner({
      planTtlMs: 60_000,
      createId: () => "plan-001",
    });
    const result = planner.plan(input, now);

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.plan.expiresAt).toBe("2026-09-10T20:00:20.000Z");
    }
  });

  it("caps plan expiry at the requested ttl when it is shorter", () => {
    const planner = createFailoverPlanner({
      planTtlMs: 10_000,
      createId: () => "plan-001",
    });
    const result = planner.plan(makeValidInput(), now);

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.plan.expiresAt).toBe("2026-09-10T20:00:10.000Z");
    }
  });

  it("never creates a plan whose target equals the source", () => {
    const planner = createFailoverPlanner({ planTtlMs: 60_000 });
    const result = planner.plan(makeValidInput(), now);

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.plan.targetNodeId).not.toBe(result.plan.sourceNodeId);
    }
  });

  it("copies topology generation and fencing token exactly from validated input", () => {
    const planner = createFailoverPlanner({ planTtlMs: 60_000 });
    const result = planner.plan(makeValidInput(), now);

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.plan.topologyGeneration).toBe(7);
      expect(result.plan.fencingToken).toBe(11);
    }
  });

  it("returns an immutable plan and immutable evidence references", () => {
    const planner = createFailoverPlanner({
      planTtlMs: 60_000,
      createId: () => "plan-001",
    });
    const result = planner.plan(makeValidInput(), now);

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(Object.isFrozen(result.plan)).toBe(true);
      expect(Object.isFrozen(result.plan.healthEvidenceRefs)).toBe(true);
    }
  });
});
