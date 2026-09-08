import { describe, expect, it, vi } from "vitest";
import type {
  RecoveryActionPort,
  RecoveryActionRequest,
  RecoveryActionResult,
} from "./recoveryAction";
import { createRecoveryOrchestrator } from "./recoveryOrchestrator";
import {
  createRecoveryPolicyEngine,
  type RecoveryDecision,
  type RecoveryPolicyConfig,
  type RecoveryTransitionInput,
} from "./recoveryPolicy";
import { createInMemoryRecoveryPolicyStore } from "./recoveryPolicyStore";

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

const transition = (
  transitionId: string,
  componentId = "database",
): RecoveryTransitionInput => ({
  transitionId,
  componentId,
  from: "healthy",
  to: "unhealthy",
  criticality: "critical",
  occurredAt: now.toISOString(),
});

const simulated = (request: RecoveryActionRequest): RecoveryActionResult => ({
  actionId: request.actionId,
  componentId: request.componentId,
  status: "simulated_success",
  reasonCode: "SIMULATED_SUCCESS",
  startedAt: now.toISOString(),
  finishedAt: now.toISOString(),
  durationMs: 0,
  correlationId: request.correlationId,
});

const config: RecoveryPolicyConfig = {
  enabled: true,
  recoverableComponents: new Set(["database", "storage"]),
  cooldownMs: 30_000,
  attemptWindowMs: 15 * 60_000,
  maxAttempts: 3,
  healthyCyclesToCloseCircuit: 2,
};

describe("RecoveryOrchestrator action port", () => {
  it("maps an allow_dry_run decision to exactly one action port call", async () => {
    const store = createInMemoryRecoveryPolicyStore();
    const execute = vi.fn(async (request: RecoveryActionRequest) => simulated(request));
    const audit = vi.fn();
    const orchestrator = createRecoveryOrchestrator({
      engine: { evaluate: () => allowedDecision },
      actionPort: { execute },
      store,
      audit,
    });

    await expect(orchestrator.handle(transition("tr-1"), now)).resolves.toEqual(allowedDecision);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      actionId: "action:decision-1",
      transitionId: "tr-1",
      componentId: "database",
      action: "restart_component",
      requestedAt: now.toISOString(),
      correlationId: "decision-1",
    });
    expect(audit.mock.calls.map(call => call[0].event)).toEqual([
      "recovery_policy_evaluated",
      "recovery_action_started",
      "recovery_action_completed",
    ]);
    expect(audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: "recovery_action_completed",
        actionId: "action:decision-1",
        action: "restart_component",
        actionStatus: "simulated_success",
        actionReasonCode: "SIMULATED_SUCCESS",
        correlationId: "decision-1",
        durationMs: 0,
      }),
    );
  });

  it.each(["suppress", "escalate"] as const)(
    "does not call the action port for a %s decision",
    async decisionKind => {
      const store = createInMemoryRecoveryPolicyStore();
      const execute = vi.fn();
      const decision: RecoveryDecision = {
        ...allowedDecision,
        decision: decisionKind,
        reasonCode: decisionKind === "suppress" ? "COOLDOWN_ACTIVE" : "ATTEMPT_LIMIT_REACHED",
      };
      const audit = vi.fn();
      const orchestrator = createRecoveryOrchestrator({
        engine: { evaluate: () => decision },
        actionPort: { execute } as RecoveryActionPort,
        store,
        audit,
      });

      await expect(orchestrator.handle(transition(`tr-${decisionKind}`), now)).resolves.toEqual(decision);
      expect(execute).not.toHaveBeenCalled();
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: decisionKind === "suppress" ? "recovery_suppressed" : "recovery_escalated",
          decisionId: decision.decisionId,
        }),
      );
    },
  );

  it("rejects an unknown component before calling the action port", async () => {
    const store = createInMemoryRecoveryPolicyStore();
    const execute = vi.fn();
    const decision = { ...allowedDecision, componentId: "unknown-service" };
    const audit = vi.fn();
    const orchestrator = createRecoveryOrchestrator({
      engine: { evaluate: () => decision },
      actionPort: { execute } as RecoveryActionPort,
      store,
      audit,
    });

    await expect(orchestrator.handle(transition("tr-unknown", "unknown-service"), now)).resolves.toEqual(decision);
    expect(execute).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "recovery_action_rejected", decisionId: decision.decisionId }),
    );
  });

  it("prevents two concurrent executions for the same component and releases inProgress", async () => {
    const store = createInMemoryRecoveryPolicyStore();
    let decisionId = 0;
    const engine = createRecoveryPolicyEngine({
      store,
      config,
      createId: () => `concurrent-${++decisionId}`,
    });
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const execute = vi.fn(async (request: RecoveryActionRequest) => {
      await pending;
      return simulated(request);
    });
    const orchestrator = createRecoveryOrchestrator({ engine, actionPort: { execute }, store });

    const first = orchestrator.handle(transition("tr-first"), now);
    await Promise.resolve();
    const second = await orchestrator.handle(transition("tr-second"), now);

    expect(second).toMatchObject({
      decision: "suppress",
      reasonCode: "RECOVERY_ALREADY_IN_PROGRESS",
    });
    expect(execute).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(store.get("database").inProgress).toBe(false);
  });

  it("isolates adapter errors, releases inProgress and never emits raw error text", async () => {
    const store = createInMemoryRecoveryPolicyStore();
    const auditEvents: unknown[] = [];
    const orchestrator = createRecoveryOrchestrator({
      engine: { evaluate: () => allowedDecision },
      actionPort: {
        execute: vi.fn(async () => {
          throw new Error("secret-token-123");
        }),
      },
      store,
      audit: event => auditEvents.push(event),
    });

    await expect(orchestrator.handle(transition("tr-error"), now)).resolves.toEqual(allowedDecision);
    expect(store.get("database").inProgress).toBe(false);
    expect(JSON.stringify(auditEvents)).not.toContain("secret-token-123");
    expect(auditEvents).toContainEqual(
      expect.objectContaining({ event: "recovery_action_rejected", decisionId: allowedDecision.decisionId }),
    );
  });

  it("allows different components to execute concurrently", async () => {
    const store = createInMemoryRecoveryPolicyStore();
    let decisionId = 0;
    const engine = createRecoveryPolicyEngine({
      store,
      config,
      createId: () => `parallel-${++decisionId}`,
    });
    const releases = new Map<string, () => void>();
    const execute = vi.fn(
      (request: RecoveryActionRequest) =>
        new Promise<RecoveryActionResult>(resolve => {
          releases.set(request.componentId, () => resolve(simulated(request)));
        }),
    );
    const orchestrator = createRecoveryOrchestrator({ engine, actionPort: { execute }, store });

    const db = orchestrator.handle(transition("db-1", "database"), now);
    const storage = orchestrator.handle(transition("storage-1", "storage"), now);
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(2);
    releases.get("database")?.();
    releases.get("storage")?.();
    await Promise.all([db, storage]);
    expect(store.get("database").inProgress).toBe(false);
    expect(store.get("storage").inProgress).toBe(false);
  });
});
