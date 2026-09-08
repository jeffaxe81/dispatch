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

  it("returns simulated_timeout without retrying", async () => {
    let sleeps = 0;
    const clock = {
      now: () => new Date("2026-09-08T00:00:00.000Z"),
      sleep: async () => {
        sleeps += 1;
      },
    };
    const adapter = createSimulatedRecoveryAdapter({
      scenario: "timeout",
      clock,
      timeoutMs: 250,
    });
    const result = await adapter.execute(request);
    expect(result.status).toBe("simulated_timeout");
    expect(result.reasonCode).toBe("SIMULATED_TIMEOUT");
    expect(sleeps).toBe(1);
  });

  it("returns simulated_cancelled for cooperative in-process cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = createSimulatedRecoveryAdapter({
      scenario: "cancelled",
      clock: createClock(),
      timeoutMs: 250,
      cancellationSignal: controller.signal,
    });
    const result = await adapter.execute(request);
    expect(result.status).toBe("simulated_cancelled");
    expect(result.reasonCode).toBe("SIMULATED_CANCELLED");
  });

  it("reuses the first result for an identical duplicate actionId", async () => {
    let calls = 0;
    const clock = {
      now: () => new Date("2026-09-08T00:00:00.000Z"),
      sleep: async () => {
        calls += 1;
      },
    };
    const adapter = createSimulatedRecoveryAdapter({
      scenario: "success",
      clock,
      timeoutMs: 250,
    });
    const first = await adapter.execute(request);
    const second = await adapter.execute({ ...request });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  it("fails closed for a conflicting duplicate actionId", async () => {
    const adapter = createSimulatedRecoveryAdapter({
      scenario: "success",
      clock: createClock(),
      timeoutMs: 250,
    });
    await adapter.execute(request);
    await expect(
      adapter.execute({ ...request, componentId: "storage" }),
    ).rejects.toThrow("DUPLICATE_ACTION_CONFLICT");
  });
});
