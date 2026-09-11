import { randomUUID } from "node:crypto";
import {
  evaluateFailoverEligibility,
  type FailoverEligibilityInput,
  type FailoverEligibilityReasonCode,
} from "./failoverEligibility";

export type FailoverPlan = Readonly<{
  planId: string;
  planVersion: "d011c2-v1";
  tenantId: string;
  componentId: string;
  sourceNodeId: string;
  targetNodeId: string;
  topologyId: string;
  topologyGeneration: number;
  fencingToken: number;
  healthEvidenceRefs: readonly string[];
  createdAt: string;
  expiresAt: string;
  mode: "simulation";
}>;

export type FailoverPlanResult =
  | Readonly<{
      planned: true;
      reasonCode: "FAILOVER_ELIGIBLE";
      plan: FailoverPlan;
    }>
  | Readonly<{
      planned: false;
      reasonCode: FailoverEligibilityReasonCode | "PLAN_WINDOW_INVALID";
    }>;

export type FailoverPlanner = Readonly<{
  plan(input: FailoverEligibilityInput, now?: Date): FailoverPlanResult;
}>;

export function createFailoverPlanner(options: {
  planTtlMs: number;
  createId?: () => string;
}): FailoverPlanner {
  const { planTtlMs, createId = randomUUID } = options;
  if (!Number.isFinite(planTtlMs) || planTtlMs <= 0) {
    throw new Error("planTtlMs must be a positive finite number");
  }

  return Object.freeze({
    plan(input: FailoverEligibilityInput, now = new Date()): FailoverPlanResult {
      const eligibility = evaluateFailoverEligibility(input, now);
      if (!eligibility.eligible) {
        return Object.freeze({
          planned: false,
          reasonCode: eligibility.reasonCode,
        });
      }

      const target = eligibility.candidates[0];
      if (!target || target.nodeId === eligibility.sourceNodeId) {
        return Object.freeze({ planned: false, reasonCode: "PLAN_WINDOW_INVALID" });
      }

      const nowMs = now.getTime();
      const requestedExpiresAtMs = nowMs + planTtlMs;
      const coordinationExpiresAtMs = Date.parse(input.coordination.expiresAt);
      const expiresAtMs = Math.min(requestedExpiresAtMs, coordinationExpiresAtMs);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
        return Object.freeze({ planned: false, reasonCode: "PLAN_WINDOW_INVALID" });
      }

      const healthEvidenceRefs = Object.freeze([
        eligibility.sourceEvidenceId,
        target.evidenceId,
      ]);

      const plan: FailoverPlan = Object.freeze({
        planId: createId(),
        planVersion: "d011c2-v1",
        tenantId: input.topology.tenantId,
        componentId: input.topology.componentId,
        sourceNodeId: eligibility.sourceNodeId,
        targetNodeId: target.nodeId,
        topologyId: input.topology.topologyId,
        topologyGeneration: input.topology.generation,
        fencingToken: input.coordination.fencingToken,
        healthEvidenceRefs,
        createdAt: now.toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        mode: "simulation",
      });

      return Object.freeze({
        planned: true,
        reasonCode: "FAILOVER_ELIGIBLE",
        plan,
      });
    },
  });
}
