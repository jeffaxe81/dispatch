import { describe, expect, it } from "vitest";
import { validateFailoverTopologyInput } from "./failoverTopology";

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

describe("D-011C.1 failover topology validation", () => {
  it("accepts a structurally valid single-active topology", () => {
    expect(validateFailoverTopologyInput(makeValidInput(), now)).toEqual({
      valid: true,
      reasonCode: "TOPOLOGY_VALID",
      sourceNodeId: "node-a",
    });
  });

  it("rejects multiple enabled active nodes", () => {
    const input = makeValidInput();
    input.topology.nodes[1] = { ...input.topology.nodes[1], role: "active" };

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "MULTIPLE_ACTIVE_NODES",
    });
  });

  it("rejects a topology without an enabled active node", () => {
    const input = makeValidInput();
    input.topology.nodes[0] = { ...input.topology.nodes[0], enabled: false };

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "ACTIVE_NODE_MISSING",
    });
  });

  it("rejects duplicated node ids", () => {
    const input = makeValidInput();
    input.topology.nodes[1] = { ...input.topology.nodes[1], nodeId: "node-a" };

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "TOPOLOGY_INVALID",
    });
  });

  it("rejects blank topology identifiers", () => {
    const input = makeValidInput();
    input.topology.topologyId = "   ";

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "TOPOLOGY_INVALID",
    });
  });

  it("rejects node generation different from topology generation", () => {
    const input = makeValidInput();
    input.topology.nodes[1] = { ...input.topology.nodes[1], generation: 8 };

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "TOPOLOGY_GENERATION_MISMATCH",
    });
  });

  it("rejects tenant mismatch in health evidence", () => {
    const input = makeValidInput();
    input.healthEvidence[1] = { ...input.healthEvidence[1], tenantId: "tenant-b" };

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "TENANT_MISMATCH",
    });
  });

  it("rejects component mismatch in health evidence", () => {
    const input = makeValidInput();
    input.healthEvidence[1] = { ...input.healthEvidence[1], componentId: "storage" };

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "COMPONENT_MISMATCH",
    });
  });

  it.each([0, -1, 1.5])("rejects invalid fencing token %s", fencingToken => {
    const input = makeValidInput();
    input.coordination.fencingToken = fencingToken;

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "FENCING_INVALID",
    });
  });

  it("rejects expired coordination context", () => {
    const input = makeValidInput();
    input.coordination.expiresAt = "2026-09-10T19:59:59.000Z";

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "COORDINATION_EXPIRED",
    });
  });

  it("rejects invalid health evidence timeline", () => {
    const input = makeValidInput();
    input.healthEvidence[1] = {
      ...input.healthEvidence[1],
      validUntil: input.healthEvidence[1].checkedAt,
    };

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "TOPOLOGY_INVALID",
    });
  });

  it("rejects stale health evidence", () => {
    const input = makeValidInput();
    input.healthEvidence[1] = {
      ...input.healthEvidence[1],
      validUntil: "2026-09-10T19:59:59.000Z",
    };

    expect(validateFailoverTopologyInput(input, now)).toEqual({
      valid: false,
      reasonCode: "HEALTH_EVIDENCE_STALE",
    });
  });
});
