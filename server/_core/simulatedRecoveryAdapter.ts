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
  const { scenario, clock, timeoutMs, cancellationSignal } = options;
  const actions = new Map<
    string,
    { fingerprint: string; resultPromise: Promise<RecoveryActionResult> }
  >();

  const fingerprint = (request: RecoveryActionRequest): string =>
    [request.transitionId, request.componentId, request.action, request.correlationId].join("|");

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

  const simulate = async (request: RecoveryActionRequest): Promise<RecoveryActionResult> => {
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

    if (scenario === "timeout") {
      await clock.sleep(Math.max(0, timeoutMs));
      return result(
        request,
        startedAt,
        clock.now(),
        "simulated_timeout",
        "SIMULATED_TIMEOUT",
      );
    }

    if (scenario === "cancelled") {
      if (!cancellationSignal?.aborted) {
        await clock.sleep(0, cancellationSignal);
      }
      return result(
        request,
        startedAt,
        clock.now(),
        "simulated_cancelled",
        "SIMULATED_CANCELLED",
      );
    }

    throw new Error("SIMULATION_SCENARIO_NOT_IMPLEMENTED");
  };

  return {
    execute(request) {
      const requestFingerprint = fingerprint(request);
      const existing = actions.get(request.actionId);
      if (existing) {
        if (existing.fingerprint !== requestFingerprint) {
          return Promise.reject(new Error("DUPLICATE_ACTION_CONFLICT"));
        }
        return existing.resultPromise;
      }

      const resultPromise = simulate(request);
      actions.set(request.actionId, { fingerprint: requestFingerprint, resultPromise });
      return resultPromise;
    },
  };
}
