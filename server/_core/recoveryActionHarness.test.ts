import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRecoveryActionHarness } from "./recoveryActionHarness";

const request = {
  actionId: "action:decision-harness",
  transitionId: "transition-harness",
  componentId: "database",
  action: "restart_component" as const,
  requestedAt: "2026-09-08T00:00:00.000Z",
  correlationId: "decision-harness",
};

describe("RecoveryActionHarness", () => {
  it("controls scenario and time without runtime knobs", async () => {
    const harness = createRecoveryActionHarness({
      scenario: "success",
      startAt: "2026-09-08T00:00:00.000Z",
    });
    const result = await harness.port.execute(request);
    expect(result.status).toBe("simulated_success");
    expect(result.startedAt).toBe("2026-09-08T00:00:00.000Z");
    expect(result.finishedAt).toBe("2026-09-08T00:00:00.001Z");
  });

  it("supports cooperative test-only cancellation", async () => {
    const harness = createRecoveryActionHarness({
      scenario: "cancelled",
      startAt: "2026-09-08T00:00:00.000Z",
    });
    harness.cancel();
    const result = await harness.port.execute({ ...request, actionId: "action:cancel" });
    expect(result.status).toBe("simulated_cancelled");
  });

  it("is not imported by runtime bootstrap or index", () => {
    const bootstrap = readFileSync("server/_core/recoveryBootstrap.ts", "utf8");
    const index = readFileSync("server/_core/index.ts", "utf8");
    expect(bootstrap).not.toContain("recoveryActionHarness");
    expect(index).not.toContain("recoveryActionHarness");
  });
});
