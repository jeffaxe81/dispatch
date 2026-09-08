import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as recoveryBootstrap from "./recoveryBootstrap";
import {
  D011B1_POLICY,
  createD011b1RecoveryRuntime,
  mapHealthTransitionToRecoveryInput,
} from "./recoveryBootstrap";

describe("D-011B.2 recovery bootstrap", () => {
  it("preserves the approved recovery policy defaults", () => {
    expect(D011B1_POLICY.enabled).toBe(true);
    expect([...D011B1_POLICY.recoverableComponents]).toEqual(["database", "storage"]);
    expect(D011B1_POLICY.cooldownMs).toBe(30_000);
    expect(D011B1_POLICY.attemptWindowMs).toBe(15 * 60_000);
    expect(D011B1_POLICY.maxAttempts).toBe(3);
    expect(D011B1_POLICY.healthyCyclesToCloseCircuit).toBe(2);
  });

  it("returns an actionPort instead of the legacy dry-run executor", () => {
    const runtime = createD011b1RecoveryRuntime();

    expect(runtime).toHaveProperty("actionPort");
    expect(runtime).not.toHaveProperty("executor");
    expect(typeof runtime.actionPort.execute).toBe("function");
  });

  it("routes an allowlisted unhealthy transition only through simulated action audit", async () => {
    const auditEvents: Array<{ event: string; actionStatus?: string }> = [];
    const runtime = createD011b1RecoveryRuntime({
      audit: event => auditEvents.push(event),
    });

    const input = mapHealthTransitionToRecoveryInput({
      componentId: "database",
      from: "healthy",
      to: "unhealthy",
      occurredAt: "2026-09-08T01:00:00.000Z",
    });

    await runtime.orchestrator.handle(input, new Date("2026-09-08T01:00:00.000Z"));

    expect(auditEvents.map(event => event.event)).toEqual([
      "recovery_policy_evaluated",
      "recovery_action_started",
      "recovery_action_completed",
    ]);
    expect(auditEvents.at(-1)).toMatchObject({
      event: "recovery_action_completed",
      actionStatus: "simulated_success",
    });
  });

  it("keeps unknown components fail-closed without action execution", async () => {
    const auditEvents: Array<{ event: string }> = [];
    const runtime = createD011b1RecoveryRuntime({
      audit: event => auditEvents.push(event),
    });

    const decision = await runtime.orchestrator.handle(
      mapHealthTransitionToRecoveryInput({
        componentId: "unknown-service",
        from: "healthy",
        to: "unhealthy",
        occurredAt: "2026-09-08T01:01:00.000Z",
      }),
      new Date("2026-09-08T01:01:00.000Z"),
    );

    expect(decision).toMatchObject({
      decision: "suppress",
      reasonCode: "COMPONENT_NOT_ALLOWLISTED",
    });
    expect(auditEvents.some(event => event.event === "recovery_action_started")).toBe(false);
  });

  it("does not expose harness or runtime recovery scenario knobs", () => {
    const bootstrapSource = readFileSync(new URL("./recoveryBootstrap.ts", import.meta.url), "utf8");
    const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

    expect(bootstrapSource).not.toContain("recoveryActionHarness");
    expect(indexSource).not.toContain("recoveryActionHarness");
    expect(bootstrapSource).not.toMatch(/process\.env.*(?:RECOVERY|SCENARIO|ACTION)/i);
    expect(bootstrapSource).not.toContain("createRestartAdapter");
    expect(bootstrapSource).not.toContain("createRealRecoveryExecutor");
    expect(bootstrapSource).not.toContain("createInfrastructureExecutor");
    expect(recoveryBootstrap).not.toHaveProperty("createRestartAdapter");
    expect(recoveryBootstrap).not.toHaveProperty("createRealRecoveryExecutor");
    expect(recoveryBootstrap).not.toHaveProperty("createInfrastructureExecutor");
  });

  it("maps HealthTransition with deterministic id and fixed criticality", () => {
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
