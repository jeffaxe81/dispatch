import type { RecoveryActionPort } from "./recoveryAction";
import {
  createSimulatedRecoveryAdapter,
  type SimulationScenario,
} from "./simulatedRecoveryAdapter";

export function createRecoveryActionHarness(options: {
  scenario?: SimulationScenario;
  startAt?: string;
  timeoutMs?: number;
} = {}): {
  port: RecoveryActionPort;
  advance(ms: number): void;
  cancel(): void;
} {
  let currentMs = Date.parse(options.startAt ?? "2026-09-08T00:00:00.000Z");
  const controller = new AbortController();

  const clock = {
    now: () => new Date(currentMs),
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) {
        return;
      }
      currentMs += Math.max(0, ms);
    },
  };

  const port = createSimulatedRecoveryAdapter({
    scenario: options.scenario ?? "success",
    clock,
    timeoutMs: options.timeoutMs ?? 1_000,
    cancellationSignal: controller.signal,
  });

  return {
    port,
    advance(ms) {
      currentMs += Math.max(0, ms);
    },
    cancel() {
      controller.abort();
    },
  };
}
