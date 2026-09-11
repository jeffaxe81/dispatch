import { describe, expect, it } from "vitest";
import type { FailoverPlan } from "./failoverPlanner";
import type {
  FailoverSimulationReasonCode,
  FailoverSimulationResult,
  FailoverSimulationStatus,
} from "./failoverSimulation";
import {
  buildFailoverSimulationEvidence,
  type FailoverSimulationEvidenceReceipt,
  verifyFailoverSimulationEvidence,
} from "./failoverSimulationEvidence";

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

function makeResult(
  overrides: Partial<FailoverSimulationResult> = {},
): FailoverSimulationResult {
  return Object.freeze({
    planId: "plan-001",
    sourceNodeId: "node-a",
    targetNodeId: "node-b",
    status: "simulated_success",
    reasonCode: "FAILOVER_SIMULATED_SUCCESS",
    startedAt: "2026-09-10T20:00:10.000Z",
    finishedAt: "2026-09-10T20:00:11.000Z",
    ...overrides,
  });
}

function buildValidReceipt() {
  const plan = makePlan();
  const result = makeResult();
  const built = buildFailoverSimulationEvidence({
    tenantId: "tenant-a",
    plan,
    result,
    recordedAt: "2026-09-10T20:00:12.000Z",
  });
  expect(built.built).toBe(true);
  if (!built.built) throw new Error("expected evidence receipt");
  return { plan, result, receipt: built.receipt };
}

function cloneReceipt(
  receipt: FailoverSimulationEvidenceReceipt,
  overrides: Partial<FailoverSimulationEvidenceReceipt>,
): FailoverSimulationEvidenceReceipt {
  return {
    ...receipt,
    ...overrides,
  } as FailoverSimulationEvidenceReceipt;
}

describe("D-011C.4 failover simulation evidence", () => {
  it("builds an immutable canonical receipt and verifies it", () => {
    const { plan, receipt } = buildValidReceipt();

    expect(receipt).toMatchObject({
      eventType: "failover.simulation",
      evidenceVersion: "d011c4-v1",
      planId: "plan-001",
      componentId: "database",
      sourceNodeId: "node-a",
      targetNodeId: "node-b",
      topologyId: "topology-001",
      topologyGeneration: 7,
      fencingToken: 11,
      healthEvidenceRefs: ["health-a", "health-b"],
      status: "simulated_success",
      reasonCode: "FAILOVER_SIMULATED_SUCCESS",
      recordedAt: "2026-09-10T20:00:12.000Z",
    });
    expect(receipt.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.evidenceId).toBe(`evidence:${receipt.digest}`);
    expect("tenantId" in receipt).toBe(false);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.healthEvidenceRefs)).toBe(true);

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-a",
        plan,
        receipt,
      }),
    ).toEqual({ valid: true });
  });

  it.each([
    ["planId", { planId: "plan-other" }],
    ["sourceNodeId", { sourceNodeId: "node-other" }],
    ["targetNodeId", { targetNodeId: "node-other" }],
  ] as const)("rejects result %s mismatch while building", (_name, overrides) => {
    const built = buildFailoverSimulationEvidence({
      tenantId: "tenant-a",
      plan: makePlan(),
      result: makeResult(overrides),
      recordedAt: "2026-09-10T20:00:12.000Z",
    });

    expect(built).toEqual({
      built: false,
      reasonCode: "EVIDENCE_LINK_MISMATCH",
    });
  });

  it.each([
    ["invalid timestamp", "not-a-timestamp"],
    ["before finish", "2026-09-10T20:00:10.999Z"],
  ] as const)("rejects invalid evidence timeline: %s", (_name, recordedAt) => {
    const built = buildFailoverSimulationEvidence({
      tenantId: "tenant-a",
      plan: makePlan(),
      result: makeResult(),
      recordedAt,
    });

    expect(built).toEqual({
      built: false,
      reasonCode: "EVIDENCE_TIMELINE_INVALID",
    });
  });

  const validPairs = [
    ["simulated_success", "FAILOVER_SIMULATED_SUCCESS"],
    ["simulated_rejected", "PLAN_EXPIRED"],
    ["simulated_rejected", "PLAN_MISMATCH"],
    ["simulated_rejected", "SIMULATION_REJECTED"],
    ["simulated_failure", "SIMULATION_FAILURE"],
  ] as const satisfies readonly (readonly [
    FailoverSimulationStatus,
    FailoverSimulationReasonCode,
  ])[];

  it.each(validPairs)("accepts semantic pair %s/%s", (status, reasonCode) => {
    const built = buildFailoverSimulationEvidence({
      tenantId: "tenant-a",
      plan: makePlan(),
      result: makeResult({ status, reasonCode }),
      recordedAt: "2026-09-10T20:00:12.000Z",
    });

    expect(built.built).toBe(true);
  });

  it("rejects an invalid status/reason semantic pair", () => {
    const built = buildFailoverSimulationEvidence({
      tenantId: "tenant-a",
      plan: makePlan(),
      result: makeResult({
        status: "simulated_success",
        reasonCode: "SIMULATION_FAILURE",
      }),
      recordedAt: "2026-09-10T20:00:12.000Z",
    });

    expect(built).toEqual({
      built: false,
      reasonCode: "EVIDENCE_SEMANTICS_INVALID",
    });
  });

  it("binds the tenant only inside the canonical digest context", () => {
    const { plan, receipt } = buildValidReceipt();

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-b",
        plan,
        receipt,
      }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });

  it("rejects a receipt built for a different tenant than the supplied plan", () => {
    const foreignPlan = makePlan({ tenantId: "tenant-b" });
    const built = buildFailoverSimulationEvidence({
      tenantId: "tenant-b",
      plan: foreignPlan,
      result: makeResult(),
      recordedAt: "2026-09-10T20:00:12.000Z",
    });
    expect(built.built).toBe(true);
    if (!built.built) throw new Error("expected foreign-tenant evidence receipt");

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-b",
        plan: makePlan({ tenantId: "tenant-a" }),
        receipt: built.receipt,
      }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_LINK_MISMATCH" });
  });

  it("rejects digest tampering", () => {
    const { plan, receipt } = buildValidReceipt();
    const replacement = receipt.digest.endsWith("0") ? "1" : "0";
    const tampered = cloneReceipt(receipt, {
      digest: `${receipt.digest.slice(0, -1)}${replacement}`,
    });

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-a",
        plan,
        receipt: tampered,
      }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });

  it.each([
    ["planId", { planId: "plan-other" }],
    ["source", { sourceNodeId: "node-other" }],
    ["target", { targetNodeId: "node-other" }],
    ["topology generation", { topologyGeneration: 8 }],
    ["fencing token", { fencingToken: 12 }],
    ["health refs", { healthEvidenceRefs: ["health-a", "health-c"] }],
  ] as const)("rejects receipt link tampering: %s", (_name, overrides) => {
    const { plan, receipt } = buildValidReceipt();
    const tampered = cloneReceipt(
      receipt,
      overrides as Partial<FailoverSimulationEvidenceReceipt>,
    );

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-a",
        plan,
        receipt: tampered,
      }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_LINK_MISMATCH" });
  });

  it("rejects receipt recordedAt before the source result finish", () => {
    const { plan, receipt } = buildValidReceipt();
    const tampered = cloneReceipt(receipt, {
      recordedAt: "2026-09-10T20:00:00.000Z",
    });

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-a",
        plan,
        receipt: tampered,
      }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_TIMELINE_INVALID" });
  });

  it("rejects a changed health reference order", () => {
    const { plan, receipt } = buildValidReceipt();
    const tampered = cloneReceipt(receipt, {
      healthEvidenceRefs: ["health-b", "health-a"],
    });

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-a",
        plan,
        receipt: tampered,
      }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_LINK_MISMATCH" });
  });

  it("rejects a one-character tenant change through digest verification", () => {
    const { plan, receipt } = buildValidReceipt();

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-b",
        plan,
        receipt,
      }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_MISMATCH" });
  });

  it("rejects receipt semantic tampering before digest acceptance", () => {
    const { plan, receipt } = buildValidReceipt();
    const tampered = cloneReceipt(receipt, {
      reasonCode: "SIMULATION_FAILURE",
    });

    expect(
      verifyFailoverSimulationEvidence({
        tenantId: "tenant-a",
        plan,
        receipt: tampered,
      }),
    ).toEqual({ valid: false, reasonCode: "EVIDENCE_SEMANTICS_INVALID" });
  });
});
