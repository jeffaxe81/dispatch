import type {
  RecoveryActionPort,
  RecoveryActionRequest,
  RecoveryActionResult,
} from "./recoveryAction";

export type SimulationScenario = "success" | "failure" | "timeout" | "cancelled";

export type SimulationClock = {
  now(): Date;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
};

export function createSimulatedRecoveryAdapter(options: {
  scenario: SimulationScenario;
  clock: SimulationClock;
  timeoutMs: number;
  cancellationSignal?: AbortSignal;
}): RecoveryActionPort {
  const { scenario, clock } = options;

  const result = (
    request: RecoveryActionRequest,
    startedAt: Date,
    finishedAt: Date,
    status: RecoveryActionResult["status"],
    reasonCode: RecoveryActionResult["reasonCode"],
  ): RecoveryActionResult => ({
    actionId: request.actionId,
    componentId: request.componentId,
    status,
    reasonCode,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    correlationId: request.correlationId,
  });

  return {
    async execute(request) {
      const startedAt = clock.now();

      if (scenario === "success") {
        await clock.sleep(1);
        return result(
          request,
          startedAt,
          clock.now(),
          "simulated_success",
          "SIMULATED_SUCCESS",
        );
      }

      if (scenario === "failure") {
        await clock.sleep(1);
        return result(
          request,
          startedAt,
          clock.now(),
          "simulated_failure",
          "SIMULATED_FAILURE",
        );
      }

      throw new Error("SIMULATION_SCENARIO_NOT_IMPLEMENTED");
    },
  };
}
