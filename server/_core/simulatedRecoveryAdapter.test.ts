import { describe, expect, it } from "vitest";
import { createSimulatedRecoveryAdapter } from "./simulatedRecoveryAdapter";

const request = {
  actionId: "action:decision-1",
  transitionId: "transition-1",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-08T00:00:00.000Z",
  correlationId: "decision-1",
};

const createClock = () => {
  let ms = Date.parse("2026-09-08T00:00:00.000Z");
  return {
    now: () => new Date(ms),
    sleep: async (delay: number) => {
      ms += delay;
    },
  };
};

describe("SimulatedRecoveryAdapter", () => {
  it("returns a deterministic simulated success", async () => {
    const adapter = createSimulatedRecoveryAdapter({
      scenario: "success",
      clock: createClock(),
      timeoutMs: 1_000,
    });
    const result = await adapter.execute(request);
    expect(result.status).toBe("simulated_success");
    expect(result.reasonCode).toBe("SIMULATED_SUCCESS");
    expect(result.actionId).toBe(request.actionId);
    expect(result.correlationId).toBe(request.correlationId);
    expect(result.durationMs).toBe(1);
  });

  it("returns a sanitized deterministic simulated failure", async () => {
    const adapter = createSimulatedRecoveryAdapter({
      scenario: "failure",
      clock: createClock(),
      timeoutMs: 1_000,
    });
    const result = await adapter.execute(request);
    expect(result.status).toBe("simulated_failure");
    expect(result.reasonCode).toBe("SIMULATED_FAILURE");
    expect(result.durationMs).toBe(1);
    expect(JSON.stringify(result)).not.toContain("stack");
  });
});
