import { describe, expect, it } from "vitest";
import { createDryRunRecoveryExecutor } from "./recoveryDryRunExecutor";
import type { RecoveryDecision } from "./recoveryPolicy";

const now = new Date("2026-09-07T12:00:00.000Z");

const allowedDecision: RecoveryDecision = {
  decisionId: "decision-1",
  componentId: "database",
  decision: "allow_dry_run",
  reasonCode: "UNHEALTHY_ELIGIBLE",
  policyVersion: "d011b1-v1",
  attemptNumber: 1,
  cooldownUntil: "2026-09-07T12:00:30.000Z",
  createdAt: now.toISOString(),
};

describe("DryRunRecoveryExecutor", () => {
  it("simulates a restart intent without side effects", async () => {
    const executor = createDryRunRecoveryExecutor();
    const result = await executor.execute(allowedDecision, now);

    expect(result).toMatchObject({
      decisionId: allowedDecision.decisionId,
      componentId: allowedDecision.componentId,
      mode: "dry_run",
      outcome: "simulated",
      actionType: "restart_component",
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
    });
  });

  it.each(["suppress", "escalate"] as const)(
    "rejects a %s decision with a sanitized error",
    async decision => {
      const executor = createDryRunRecoveryExecutor();
      const blocked: RecoveryDecision = {
        ...allowedDecision,
        decisionId: `decision-${decision}`,
        decision,
        reasonCode: decision === "suppress" ? "COOLDOWN_ACTIVE" : "ATTEMPT_LIMIT_REACHED",
      };

      await expect(executor.execute(blocked, now)).rejects.toThrow(
        "Recovery decision is not executable in dry-run mode.",
      );
    },
  );
});
