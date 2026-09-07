import { describe, expect, it } from "vitest";
import type { RecoveryDecision } from "./recoveryPolicy";
import * as recoveryBootstrap from "./recoveryBootstrap";
import {
  D011B1_POLICY,
  createD011b1RecoveryRuntime,
  mapHealthTransitionToRecoveryInput,
} from "./recoveryBootstrap";

describe("D-011B.1 recovery bootstrap", () => {
  it("expõe a configuração default aprovada exatamente", () => {
    expect(D011B1_POLICY.enabled).toBe(true);
    expect([...D011B1_POLICY.recoverableComponents]).toEqual(["database", "storage"]);
    expect(D011B1_POLICY.cooldownMs).toBe(30_000);
    expect(D011B1_POLICY.attemptWindowMs).toBe(15 * 60_000);
    expect(D011B1_POLICY.maxAttempts).toBe(3);
    expect(D011B1_POLICY.healthyCyclesToCloseCircuit).toBe(2);
  });

  it("constrói somente executor dry-run", async () => {
    const runtime = createD011b1RecoveryRuntime();
    const decision: RecoveryDecision = {
      decisionId: "bootstrap-1",
      componentId: "database",
      decision: "allow_dry_run",
      reasonCode: "UNHEALTHY_ELIGIBLE",
      policyVersion: "d011b1-v1",
      attemptNumber: 1,
      cooldownUntil: "2026-09-07T12:00:30.000Z",
      createdAt: "2026-09-07T12:00:00.000Z",
    };

    await expect(
      runtime.executor.execute(decision, new Date("2026-09-07T12:00:00.000Z")),
    ).resolves.toMatchObject({
      mode: "dry_run",
      outcome: "simulated",
      actionType: "restart_component",
    });

    expect(recoveryBootstrap).not.toHaveProperty("createRestartAdapter");
    expect(recoveryBootstrap).not.toHaveProperty("createRealRecoveryExecutor");
    expect(recoveryBootstrap).not.toHaveProperty("createInfrastructureExecutor");
  });

  it("mapeia HealthTransition com id determinístico e criticalidade fixa", () => {
    expect(
      mapHealthTransitionToRecoveryInput({
        componentId: "database",
        from: "healthy",
        to: "unhealthy",
        occurredAt: "2026-09-07T12:00:00.000Z",
      }),
    ).toEqual({
      transitionId: "database:healthy:unhealthy:2026-09-07T12:00:00.000Z",
      componentId: "database",
      from: "healthy",
      to: "unhealthy",
      criticality: "critical",
      occurredAt: "2026-09-07T12:00:00.000Z",
    });
  });
});
