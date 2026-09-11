import type { FailoverPlan } from "./failoverPlanner";

export type FailoverSimulationCapability = Readonly<{
  kind: "failover-simulation";
  version: "d011c3-v1";
}>;

export type FailoverSimulationStatus =
  | "simulated_success"
  | "simulated_rejected"
  | "simulated_failure";

export type FailoverSimulationReasonCode =
  | "FAILOVER_SIMULATED_SUCCESS"
  | "SIMULATION_REJECTED"
  | "SIMULATION_FAILURE"
  | "PLAN_EXPIRED"
  | "PLAN_MISMATCH";

export type FailoverSimulationResult = Readonly<{
  planId: string;
  sourceNodeId: string;
  targetNodeId: string;
  status: FailoverSimulationStatus;
  reasonCode: FailoverSimulationReasonCode;
  startedAt: string;
  finishedAt: string;
}>;

export type FailoverSimulationPort = Readonly<{
  capability: FailoverSimulationCapability;
  execute(plan: FailoverPlan): Promise<FailoverSimulationResult>;
}>;

export type FailoverSimulationPlanValidation =
  | Readonly<{ valid: true }>
  | Readonly<{ valid: false; reasonCode: "PLAN_EXPIRED" | "PLAN_MISMATCH" }>;

export const FAILOVER_SIMULATION_CAPABILITY: FailoverSimulationCapability = Object.freeze({
  kind: "failover-simulation",
  version: "d011c3-v1",
});

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseFiniteTimestamp(value: unknown): number | null {
  if (!isNonEmptyString(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateFailoverSimulationPlan(
  plan: FailoverPlan,
  at: Date,
): FailoverSimulationPlanValidation {
  const atMs = at.getTime();
  if (!Number.isFinite(atMs)) {
    return Object.freeze({ valid: false, reasonCode: "PLAN_MISMATCH" });
  }

  if (
    plan.planVersion !== "d011c2-v1" ||
    plan.mode !== "simulation" ||
    !isNonEmptyString(plan.planId) ||
    !isNonEmptyString(plan.tenantId) ||
    !isNonEmptyString(plan.componentId) ||
    !isNonEmptyString(plan.sourceNodeId) ||
    !isNonEmptyString(plan.targetNodeId) ||
    !isNonEmptyString(plan.topologyId) ||
    plan.sourceNodeId === plan.targetNodeId ||
    !isPositiveInteger(plan.topologyGeneration) ||
    !isPositiveInteger(plan.fencingToken) ||
    !Array.isArray(plan.healthEvidenceRefs) ||
    plan.healthEvidenceRefs.length === 0 ||
    plan.healthEvidenceRefs.some(ref => !isNonEmptyString(ref))
  ) {
    return Object.freeze({ valid: false, reasonCode: "PLAN_MISMATCH" });
  }

  const createdAtMs = parseFiniteTimestamp(plan.createdAt);
  const expiresAtMs = parseFiniteTimestamp(plan.expiresAt);
  if (createdAtMs === null || expiresAtMs === null || expiresAtMs <= createdAtMs) {
    return Object.freeze({ valid: false, reasonCode: "PLAN_MISMATCH" });
  }

  if (expiresAtMs <= atMs) {
    return Object.freeze({ valid: false, reasonCode: "PLAN_EXPIRED" });
  }

  return Object.freeze({ valid: true });
}
