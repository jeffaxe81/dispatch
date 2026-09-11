import { describe, expect, it } from "vitest";
import { evaluateFailoverEligibility } from "./failoverEligibility";

const now = new Date("2026-09-10T20:00:00.000Z");

type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

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
        state: "unhealthy" as HealthState,
        checkedAt: "2026-09-10T19:59:30.000Z",
        validUntil: "2026-09-10T20:00:30.000Z",
      },
      {
        evidenceId: "health-c",
        tenantId: "tenant-a",
        nodeId: "node-c",
        componentId: "database",
        state: "healthy" as HealthState,
        checkedAt: "2026-09-10T19:59:30.000Z",
        validUntil: "2026-09-10T20:00:30.000Z",
      },
      {
        evidenceId: "health-b",
        tenantId: "tenant-a",
        nodeId: "node-b",
        componentId: "database",
        state: "healthy" as HealthState,
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

describe("D-011C.1 failover eligibility", () => {
  it("returns safe standby candidates in deterministic lexical order", () => {
    expect(evaluateFailoverEligibility(makeValidInput(), now)).toEqual({
      eligible: true,
      reasonCode: "FAILOVER_ELIGIBLE",
      sourceNodeId: "node-a",
      sourceEvidenceId: "health-a",
      candidates: [
        { nodeId: "node-b", evidenceId: "health-b" },
        { nodeId: "node-c", evidenceId: "health-c" },
      ],
    });
  });

  it("uses code-point lexical ordering rather than host locale collation", () => {
    const input = makeValidInput();
    input.topology.nodes[1] = { ...input.topology.nodes[1], nodeId: "a-node" };
    input.topology.nodes[2] = { ...input.topology.nodes[2], nodeId: "Z-node" };
    input.healthEvidence[1] = {
      ...input.healthEvidence[1],
      nodeId: "a-node",
      evidenceId: "health-lowercase",
    };
    input.healthEvidence[2] = {
      ...input.healthEvidence[2],
      nodeId: "Z-node",
      evidenceId: "health-uppercase",
    };

    const result = evaluateFailoverEligibility(input, now);
    expect(result).toMatchObject({ eligible: true, reasonCode: "FAILOVER_ELIGIBLE" });
    if (result.eligible) {
      expect(result.candidates).toEqual([
        { nodeId: "Z-node", evidenceId: "health-uppercase" },
        { nodeId: "a-node", evidenceId: "health-lowercase" },
      ]);
    }
  });

  it.each(["healthy", "unknown"] as const)(
    "rejects source state %s",
    sourceState => {
      const input = makeValidInput();
      input.healthEvidence[0] = { ...input.healthEvidence[0], state: sourceState };

      expect(evaluateFailoverEligibility(input, now)).toEqual({
        eligible: false,
        reasonCode: "SOURCE_NOT_FAILOVER_ELIGIBLE",
      });
    },
  );

  it("accepts a degraded source as failover-eligible", () => {
    const input = makeValidInput();
    input.healthEvidence[0] = { ...input.healthEvidence[0], state: "degraded" };

    expect(evaluateFailoverEligibility(input, now)).toMatchObject({
      eligible: true,
      reasonCode: "FAILOVER_ELIGIBLE",
      sourceNodeId: "node-a",
    });
  });

  it.each(["degraded", "unhealthy", "unknown"] as const)(
    "excludes target state %s and rejects when no safe candidate remains",
    targetState => {
      const input = makeValidInput();
      input.healthEvidence[1] = { ...input.healthEvidence[1], state: targetState };
      input.healthEvidence[2] = { ...input.healthEvidence[2], state: targetState };

      expect(evaluateFailoverEligibility(input, now)).toEqual({
        eligible: false,
        reasonCode: "NO_SAFE_CANDIDATE",
      });
    },
  );

  it("rejects missing source evidence", () => {
    const input = makeValidInput();
    input.healthEvidence = input.healthEvidence.filter(
      evidence => evidence.nodeId !== "node-a",
    );

    expect(evaluateFailoverEligibility(input, now)).toEqual({
      eligible: false,
      reasonCode: "HEALTH_EVIDENCE_MISSING",
    });
  });

  it("rejects stale candidate evidence", () => {
    const input = makeValidInput();
    input.healthEvidence[1] = {
      ...input.healthEvidence[1],
      validUntil: "2026-09-10T19:59:59.000Z",
    };

    expect(evaluateFailoverEligibility(input, now)).toEqual({
      eligible: false,
      reasonCode: "HEALTH_EVIDENCE_STALE",
    });
  });

  it("returns no safe candidate when standby evidence is absent", () => {
    const input = makeValidInput();
    input.healthEvidence = input.healthEvidence.filter(
      evidence => evidence.nodeId === "node-a",
    );

    expect(evaluateFailoverEligibility(input, now)).toEqual({
      eligible: false,
      reasonCode: "NO_SAFE_CANDIDATE",
    });
  });

  it("propagates tenant mismatch", () => {
    const input = makeValidInput();
    input.coordination.tenantId = "tenant-b";

    expect(evaluateFailoverEligibility(input, now)).toEqual({
      eligible: false,
      reasonCode: "TENANT_MISMATCH",
    });
  });

  it("propagates component mismatch", () => {
    const input = makeValidInput();
    input.coordination.componentId = "storage";

    expect(evaluateFailoverEligibility(input, now)).toEqual({
      eligible: false,
      reasonCode: "COMPONENT_MISMATCH",
    });
  });

  it("propagates topology generation mismatch", () => {
    const input = makeValidInput();
    input.coordination.topologyGeneration = 8;

    expect(evaluateFailoverEligibility(input, now)).toEqual({
      eligible: false,
      reasonCode: "TOPOLOGY_GENERATION_MISMATCH",
    });
  });

  it("propagates invalid fencing", () => {
    const input = makeValidInput();
    input.coordination.fencingToken = 0;

    expect(evaluateFailoverEligibility(input, now)).toEqual({
      eligible: false,
      reasonCode: "FENCING_INVALID",
    });
  });
});