import { createHash } from "node:crypto";
import type { FailoverPlan } from "./failoverPlanner";
import type {
  FailoverSimulationReasonCode,
  FailoverSimulationResult,
  FailoverSimulationStatus,
} from "./failoverSimulation";

export type FailoverSimulationEvidenceReceipt = Readonly<{
  eventType: "failover.simulation";
  evidenceVersion: "d011c4-v1";
  evidenceId: string;
  planId: string;
  componentId: string;
  sourceNodeId: string;
  targetNodeId: string;
  topologyId: string;
  topologyGeneration: number;
  fencingToken: number;
  healthEvidenceRefs: readonly string[];
  status: FailoverSimulationResult["status"];
  reasonCode: FailoverSimulationResult["reasonCode"];
  startedAt: string;
  finishedAt: string;
  recordedAt: string;
  digest: string;
}>;

export type FailoverSimulationEvidenceBuildResult =
  | Readonly<{
      built: true;
      receipt: FailoverSimulationEvidenceReceipt;
    }>
  | Readonly<{
      built: false;
      reasonCode:
        | "EVIDENCE_LINK_MISMATCH"
        | "EVIDENCE_TIMELINE_INVALID"
        | "EVIDENCE_SEMANTICS_INVALID";
    }>;

export type FailoverSimulationEvidenceVerificationResult =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reasonCode:
        | "EVIDENCE_MISMATCH"
        | "EVIDENCE_TIMELINE_INVALID"
        | "EVIDENCE_SEMANTICS_INVALID"
        | "EVIDENCE_LINK_MISMATCH";
    }>;

const EVENT_TYPE = "failover.simulation" as const;
const EVIDENCE_VERSION = "d011c4-v1" as const;

function digestCanonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseFiniteTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isValidSemanticPair(
  status: FailoverSimulationStatus,
  reasonCode: FailoverSimulationReasonCode,
): boolean {
  if (status === "simulated_success") {
    return reasonCode === "FAILOVER_SIMULATED_SUCCESS";
  }
  if (status === "simulated_failure") {
    return reasonCode === "SIMULATION_FAILURE";
  }
  if (status === "simulated_rejected") {
    return (
      reasonCode === "PLAN_EXPIRED" ||
      reasonCode === "PLAN_MISMATCH" ||
      reasonCode === "SIMULATION_REJECTED"
    );
  }
  return false;
}

function canonicalContent(input: {
  tenantId: string;
  planId: string;
  componentId: string;
  sourceNodeId: string;
  targetNodeId: string;
  topologyId: string;
  topologyGeneration: number;
  fencingToken: number;
  healthEvidenceRefs: readonly string[];
  status: FailoverSimulationStatus;
  reasonCode: FailoverSimulationReasonCode;
  startedAt: string;
  finishedAt: string;
  recordedAt: string;
}) {
  return {
    tenantId: input.tenantId,
    eventType: EVENT_TYPE,
    evidenceVersion: EVIDENCE_VERSION,
    planId: input.planId,
    componentId: input.componentId,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    topologyId: input.topologyId,
    topologyGeneration: input.topologyGeneration,
    fencingToken: input.fencingToken,
    healthEvidenceRefs: [...input.healthEvidenceRefs],
    status: input.status,
    reasonCode: input.reasonCode,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    recordedAt: input.recordedAt,
  };
}

function resultLinksPlan(plan: FailoverPlan, result: FailoverSimulationResult): boolean {
  return (
    result.planId === plan.planId &&
    result.sourceNodeId === plan.sourceNodeId &&
    result.targetNodeId === plan.targetNodeId
  );
}

function receiptLinksPlan(
  plan: FailoverPlan,
  receipt: FailoverSimulationEvidenceReceipt,
): boolean {
  return (
    receipt.eventType === EVENT_TYPE &&
    receipt.evidenceVersion === EVIDENCE_VERSION &&
    receipt.planId === plan.planId &&
    receipt.componentId === plan.componentId &&
    receipt.sourceNodeId === plan.sourceNodeId &&
    receipt.targetNodeId === plan.targetNodeId &&
    receipt.topologyId === plan.topologyId &&
    receipt.topologyGeneration === plan.topologyGeneration &&
    receipt.fencingToken === plan.fencingToken &&
    Array.isArray(receipt.healthEvidenceRefs) &&
    arraysEqual(receipt.healthEvidenceRefs, plan.healthEvidenceRefs)
  );
}

function validResultTimeline(result: FailoverSimulationResult, recordedAt: string): boolean {
  const startedAtMs = parseFiniteTimestamp(result.startedAt);
  const finishedAtMs = parseFiniteTimestamp(result.finishedAt);
  const recordedAtMs = parseFiniteTimestamp(recordedAt);
  return (
    startedAtMs !== null &&
    finishedAtMs !== null &&
    recordedAtMs !== null &&
    finishedAtMs >= startedAtMs &&
    recordedAtMs >= finishedAtMs
  );
}

function validReceiptTimeline(
  plan: FailoverPlan,
  receipt: Pick<FailoverSimulationEvidenceReceipt, "startedAt" | "finishedAt" | "recordedAt">,
): boolean {
  const createdAtMs = parseFiniteTimestamp(plan.createdAt);
  const startedAtMs = parseFiniteTimestamp(receipt.startedAt);
  const finishedAtMs = parseFiniteTimestamp(receipt.finishedAt);
  const recordedAtMs = parseFiniteTimestamp(receipt.recordedAt);
  return (
    createdAtMs !== null &&
    startedAtMs !== null &&
    finishedAtMs !== null &&
    recordedAtMs !== null &&
    finishedAtMs >= startedAtMs &&
    recordedAtMs >= finishedAtMs &&
    recordedAtMs > createdAtMs
  );
}

export function buildFailoverSimulationEvidence(input: {
  tenantId: string;
  plan: FailoverPlan;
  result: FailoverSimulationResult;
  recordedAt: string;
}): FailoverSimulationEvidenceBuildResult {
  const { tenantId, plan, result, recordedAt } = input;

  if (tenantId !== plan.tenantId || !resultLinksPlan(plan, result)) {
    return Object.freeze({
      built: false,
      reasonCode: "EVIDENCE_LINK_MISMATCH",
    });
  }

  if (!isValidSemanticPair(result.status, result.reasonCode)) {
    return Object.freeze({
      built: false,
      reasonCode: "EVIDENCE_SEMANTICS_INVALID",
    });
  }

  if (!validResultTimeline(result, recordedAt)) {
    return Object.freeze({
      built: false,
      reasonCode: "EVIDENCE_TIMELINE_INVALID",
    });
  }

  const healthEvidenceRefs = Object.freeze([...plan.healthEvidenceRefs]);
  const content = canonicalContent({
    tenantId,
    planId: plan.planId,
    componentId: plan.componentId,
    sourceNodeId: plan.sourceNodeId,
    targetNodeId: plan.targetNodeId,
    topologyId: plan.topologyId,
    topologyGeneration: plan.topologyGeneration,
    fencingToken: plan.fencingToken,
    healthEvidenceRefs,
    status: result.status,
    reasonCode: result.reasonCode,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    recordedAt,
  });
  const digest = digestCanonical(content);

  const receipt: FailoverSimulationEvidenceReceipt = Object.freeze({
    eventType: EVENT_TYPE,
    evidenceVersion: EVIDENCE_VERSION,
    evidenceId: `evidence:${digest}`,
    planId: plan.planId,
    componentId: plan.componentId,
    sourceNodeId: plan.sourceNodeId,
    targetNodeId: plan.targetNodeId,
    topologyId: plan.topologyId,
    topologyGeneration: plan.topologyGeneration,
    fencingToken: plan.fencingToken,
    healthEvidenceRefs,
    status: result.status,
    reasonCode: result.reasonCode,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    recordedAt,
    digest,
  });

  return Object.freeze({ built: true, receipt });
}

export function verifyFailoverSimulationEvidence(input: {
  tenantId: string;
  plan: FailoverPlan;
  receipt: FailoverSimulationEvidenceReceipt;
}): FailoverSimulationEvidenceVerificationResult {
  const { tenantId, plan, receipt } = input;

  if (tenantId !== plan.tenantId) {
    return Object.freeze({
      valid: false,
      reasonCode: "EVIDENCE_LINK_MISMATCH",
    });
  }

  if (!isValidSemanticPair(receipt.status, receipt.reasonCode)) {
    return Object.freeze({
      valid: false,
      reasonCode: "EVIDENCE_SEMANTICS_INVALID",
    });
  }

  if (!receiptLinksPlan(plan, receipt)) {
    return Object.freeze({
      valid: false,
      reasonCode: "EVIDENCE_LINK_MISMATCH",
    });
  }

  if (!validReceiptTimeline(plan, receipt)) {
    return Object.freeze({
      valid: false,
      reasonCode: "EVIDENCE_TIMELINE_INVALID",
    });
  }

  const expectedDigest = digestCanonical(
    canonicalContent({
      tenantId,
      planId: receipt.planId,
      componentId: receipt.componentId,
      sourceNodeId: receipt.sourceNodeId,
      targetNodeId: receipt.targetNodeId,
      topologyId: receipt.topologyId,
      topologyGeneration: receipt.topologyGeneration,
      fencingToken: receipt.fencingToken,
      healthEvidenceRefs: receipt.healthEvidenceRefs,
      status: receipt.status,
      reasonCode: receipt.reasonCode,
      startedAt: receipt.startedAt,
      finishedAt: receipt.finishedAt,
      recordedAt: receipt.recordedAt,
    }),
  );

  if (
    receipt.digest !== expectedDigest ||
    receipt.evidenceId !== `evidence:${expectedDigest}`
  ) {
    return Object.freeze({
      valid: false,
      reasonCode: "EVIDENCE_MISMATCH",
    });
  }

  return Object.freeze({ valid: true });
}
