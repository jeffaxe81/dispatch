import { describe, expect, it } from "vitest";
import type { FailoverPlan } from "./failoverPlanner";
import type { FailoverSimulationResult } from "./failoverSimulation";
import {
  buildFailoverSimulationEvidence,
  type FailoverSimulationEvidenceReceipt,
  verifyFailoverSimulationEvidence,
} from "./failoverSimulationEvidence";

function makePlan(): FailoverPlan {
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
  });
}

function makeResult(): FailoverSimulationResult {
  return Object.freeze({
    planId: "plan-001",
    sourceNodeId: "node-a",
    targetNodeId: "node-b",
    status: "simulated_success",
    reasonCode: "FAILOVER_SIMULATED_SUCCESS",
    startedAt: "2026-09-10T20:00:10.000Z",
    finishedAt: "2026-09-10T20:00:11.000Z",
  });
}

function buildReceipt() {
  const plan = makePlan();
  const built = buildFailoverSimulationEvidence({
    tenantId: "tenant-a",
    plan,
    result: makeResult(),
    recordedAt: "2026-09-10T20:00:12.000Z",
  });
  expect(built.built).toBe(true);
  if (!built.built) throw new Error("expected receipt");
  return { plan, receipt: built.receipt };
}

describe("D-011C.4 evidence timeline binding", () => {
  it("persists the C.3 execution interval in the canonical receipt", () => {
    const { receipt } = buildReceipt();
    expect(receipt.startedAt).toBe("2026-09-10T20:00:10.000Z");
    expect(receipt.finishedAt).toBe("2026-09-10T20:00:11.000Z");
  });

  it("fails closed when the persisted execution interval is impossible", () => {
    const { plan, receipt } = buildReceipt();
    const tampered = {
      ...receipt,
      startedAt: "2026-09-10T20:00:11.000Z",
      finishedAt: "2026-09-10T20:00:10.000Z",
    } as FailoverSimulationEvidenceReceipt;

    expect(
      verifyFailoverSimulationEvidence({ tenantId: "tenant-a", plan, receipt: tampered }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_TIMELINE_INVALID" });
  });

  it("fails closed when recordedAt precedes the persisted finish", () => {
    const { plan, receipt } = buildReceipt();
    const tampered = {
      ...receipt,
      finishedAt: "2026-09-10T20:00:13.000Z",
    } as FailoverSimulationEvidenceReceipt;

    expect(
      verifyFailoverSimulationEvidence({ tenantId: "tenant-a", plan, receipt: tampered }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_TIMELINE_INVALID" });
  });
});