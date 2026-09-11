import type { FailoverPlan } from "./failoverPlanner";
import {
  FAILOVER_SIMULATION_CAPABILITY,
  type FailoverSimulationPort,
  type FailoverSimulationReasonCode,
  type FailoverSimulationResult,
  type FailoverSimulationStatus,
  validateFailoverSimulationPlan,
} from "./failoverSimulation";

export type SimulatedFailoverMode = "success" | "failure";

export type SimulatedFailoverAdapterOptions = Readonly<{
  mode: SimulatedFailoverMode;
  now?: () => Date;
}>;

function buildResult(input: {
  plan: FailoverPlan;
  status: FailoverSimulationStatus;
  reasonCode: FailoverSimulationReasonCode;
  startedAt: string;
  finishedAt: string;
}): FailoverSimulationResult {
  return Object.freeze({
    planId: input.plan.planId,
    sourceNodeId: input.plan.sourceNodeId,
    targetNodeId: input.plan.targetNodeId,
    status: input.status,
    reasonCode: input.reasonCode,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  });
}

export function createSimulatedFailoverAdapter(
  options: SimulatedFailoverAdapterOptions,
): FailoverSimulationPort {
  const { mode, now = () => new Date() } = options;

  return Object.freeze({
    capability: FAILOVER_SIMULATION_CAPABILITY,
    async execute(plan: FailoverPlan): Promise<FailoverSimulationResult> {
      const started = now();
      const startedMs = started.getTime();
      const startedAt = started.toISOString();

      const validation = validateFailoverSimulationPlan(plan, started);
      if (!validation.valid) {
        const finished = now();
        const finishedMs = finished.getTime();
        const finishedAt =
          Number.isFinite(finishedMs) && finishedMs >= startedMs
            ? finished.toISOString()
            : startedAt;
        return buildResult({
          plan,
          status: "simulated_rejected",
          reasonCode: validation.reasonCode,
          startedAt,
          finishedAt,
        });
      }

      const finished = now();
      const finishedMs = finished.getTime();
      if (!Number.isFinite(finishedMs) || finishedMs < startedMs) {
        return buildResult({
          plan,
          status: "simulated_rejected",
          reasonCode: "SIMULATION_REJECTED",
          startedAt,
          finishedAt: startedAt,
        });
      }

      if (mode === "failure") {
        return buildResult({
          plan,
          status: "simulated_failure",
          reasonCode: "SIMULATION_FAILURE",
          startedAt,
          finishedAt: finished.toISOString(),
        });
      }

      return buildResult({
        plan,
        status: "simulated_success",
        reasonCode: "FAILOVER_SIMULATED_SUCCESS",
        startedAt,
        finishedAt: finished.toISOString(),
      });
    },
  });
}
