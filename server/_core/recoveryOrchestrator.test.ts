import { describe, expect, it, vi } from "vitest";
import type { DryRunRecoveryExecutor, DryRunRecoveryResult } from "./recoveryDryRunExecutor";
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

const simulated = (decision: RecoveryDecision): DryRunRecoveryResult => ({
  decisionId: decision.decisionId,
  componentId: decision.componentId,
  mode: "dry_run",
  outcome: "simulated",
  actionType: "restart_component",
  startedAt: now.toISOString(),
  completedAt: now.toISOString(),
});

const config: RecoveryPolicyConfig = {
  enabled: true,
  recoverableComponents: new Set(["database", "storage"]),
  cooldownMs: 30_000,
  attemptWindowMs: 15 * 60_000,
  maxAttempts: 3,
  healthyCyclesToCloseCircuit: 2,
};

describe("RecoveryOrchestrator", () => {
  it("executes an allow_dry_run decision exactly once and emits sanitized lifecycle audit", async () => {
    const store = createInMemoryRecoveryPolicyStore();
    const execute = vi.fn(async (decision: RecoveryDecision) => simulated(decision));
    const audit = vi.fn();
    const orchestrator = createRecoveryOrchestrator({
      engine: { evaluate: () => allowedDecision },
      executor: { execute },
      store,
      audit,
    });

    await expect(orchestrator.handle(transition("tr-1"), now)).resolves.toEqual(allowedDecision);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls.map(call => call[0].event)).toEqual([
      "recovery_policy_evaluated",
      "recovery_dry_run_started",
      "recovery_dry_run_completed",
    ]);
  });

  it.each(["suppress", "escalate"] as const)(
    "does not execute a %s decision",
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
        executor: { execute } as unknown as DryRunRecoveryExecutor,
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

  it("prevents two concurrent executions for the same component", async () => {
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
    const execute = vi.fn(async (decision: RecoveryDecision) => {
      await pending;
      return simulated(decision);
    });
    const orchestrator = createRecoveryOrchestrator({ engine, executor: { execute }, store });

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

  it("swallows executor errors and never emits raw error text", async () => {
    const store = createInMemoryRecoveryPolicyStore();
    const auditEvents: unknown[] = [];
    const orchestrator = createRecoveryOrchestrator({
      engine: { evaluate: () => allowedDecision },
      executor: {
        execute: vi.fn(async () => {
          throw new Error("secret-token-123");
        }),
      },
      store,
      audit: event => auditEvents.push(event),
    });

    await expect(orchestrator.handle(transition("tr-error"), now)).resolves.toEqual(allowedDecision);
    expect(JSON.stringify(auditEvents)).not.toContain("secret-token-123");
    expect(auditEvents).toContainEqual(
      expect.objectContaining({ event: "recovery_suppressed", decisionId: allowedDecision.decisionId }),
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
      (decision: RecoveryDecision) =>
        new Promise<DryRunRecoveryResult>(resolve => {
          releases.set(decision.componentId, () => resolve(simulated(decision)));
        }),
    );
    const orchestrator = createRecoveryOrchestrator({ engine, executor: { execute }, store });

    const db = orchestrator.handle(transition("db-1", "database"), now);
    const storage = orchestrator.handle(transition("storage-1", "storage"), now);
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(2);
    releases.get("database")?.();
    releases.get("storage")?.();
    await Promise.all([db, storage]);
  });
});
