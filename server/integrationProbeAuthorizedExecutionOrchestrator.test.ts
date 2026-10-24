import { describe, expect, it, vi } from "vitest";
import type { IntegrationProbeExecutionSnapshot } from "./integrationCircuitProbeExecutionIntent";
import type { ProbeOneShotIntentIssueAuthorization } from "./integrationProbeManualExecutionAuthorization";
import type { ProbeManualExecutionApproval, ProbeManualExecutionPlan } from "./integrationProbeManualExecutionPlan";
import { executeAuthorizedIntegrationProbeOnce } from "./integrationProbeAuthorizedExecutionOrchestrator";

const approval: ProbeManualExecutionApproval = Object.freeze({
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  requestedAction: "probe_once",
  approvalId: "APR-J42-001",
  requestedByUserId: 41,
  approvedByUserId: 52,
  approvedAtMs: 1_000,
  expiresAtMs: 601_000,
});

const manualPlan: ProbeManualExecutionPlan = Object.freeze({
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  approvalId: approval.approvalId,
  requestedAction: "probe_once",
  status: "ready_for_manual_operator_review",
  steps: Object.freeze([
    "verify_scope_and_approval",
    "verify_fresh_reconciliation",
    "verify_circuit_version",
    "prepare_one_shot_intent",
    "require_separate_execution_authorization",
  ]),
  permitsProbe: false,
  permitsReplay: false,
  permitsExternalCall: false,
  permitsAutomaticReplay: false,
});

const executionAuthorization: ProbeOneShotIntentIssueAuthorization = Object.freeze({
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  approvalId: approval.approvalId,
  authorizationId: "EXE-AUTH-J42-001",
  action: "issue_one_shot_probe_intent",
  authorizedByUserId: 63,
  authorizedAtMs: 130_000,
  expiresAtMs: 310_000,
});

const current: IntegrationProbeExecutionSnapshot = Object.freeze({
  organizationId: 7,
  system: "neo",
  circuitState: "half_open",
  circuitVersion: 9,
  leaseOwner: "probe-worker-j42",
  leaseToken: "LEASE-J42",
  leaseExpiresAtMs: 300_000,
  executionToken: null,
  executionExpiresAtMs: null,
  executionConsumedAtMs: null,
});

describe("D-012J J42 — orquestração one-shot autorizada", () => {
  it("encadeia J39 -> J40 -> J32 e retorna somente o resultado final do executor", async () => {
    const executorResult = Object.freeze({
      state: "closed",
      version: 12,
      permitsProbe: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    const execute = vi.fn(async (handoff: Record<string, unknown>) => {
      expect(handoff).toMatchObject({
        organizationId: 7,
        system: "neo",
        expectedVersion: 10,
        approvalId: approval.approvalId,
        authorizationId: executionAuthorization.authorizationId,
        status: "ready_for_j32_atomic_consumption",
        permitsProbe: false,
        permitsReplay: false,
        permitsExternalCall: false,
        permitsAutomaticReplay: false,
      });
      expect(handoff).toHaveProperty("leaseToken", "LEASE-J42");
      expect(handoff).toHaveProperty("executionToken", "EXEC-J42");
      return executorResult;
    });

    const result = await executeAuthorizedIntegrationProbeOnce({
      approval,
      manualPlan,
      executionAuthorization,
      current,
      nowEpochMs: 140_000,
      executionToken: "EXEC-J42",
      executionDurationMs: 60_000,
      cooldownSeconds: 30,
    }, { executor: { execute } });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toBe(executorResult);
    expect(result).not.toHaveProperty("leaseToken");
    expect(result).not.toHaveProperty("executionToken");
    expect(result).not.toHaveProperty("approvalId");
    expect(result).not.toHaveProperty("authorizationId");
  });

  it("remove tokens e identificadores sensíveis do snapshot real retornado pelo J32", async () => {
    const execute = vi.fn(async () => Object.freeze({
      organizationId: 7,
      system: "neo" as const,
      state: "closed" as const,
      version: 12,
      consecutiveFailures: 0,
      openedAtMs: null,
      cooldownUntilMs: null,
      leaseOwner: null,
      leaseToken: "LEASE-NAO-PODE-VAZAR",
      leaseExpiresAtMs: null,
      executionToken: "EXEC-NAO-PODE-VAZAR",
      executionExpiresAtMs: null,
      executionConsumedAtMs: 141_000,
      approvalId: approval.approvalId,
      authorizationId: executionAuthorization.authorizationId,
      permitsProbe: false as const,
      permitsExternalCall: false as const,
      permitsAutomaticReplay: false as const,
    }));

    const result = await executeAuthorizedIntegrationProbeOnce({
      approval,
      manualPlan,
      executionAuthorization,
      current,
      nowEpochMs: 140_000,
      executionToken: "EXEC-J42",
      executionDurationMs: 60_000,
      cooldownSeconds: 30,
    }, { executor: { execute } });

    expect(result).toMatchObject({
      organizationId: 7,
      system: "neo",
      state: "closed",
      version: 12,
      permitsProbe: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(result).not.toHaveProperty("leaseToken");
    expect(result).not.toHaveProperty("executionToken");
    expect(result).not.toHaveProperty("approvalId");
    expect(result).not.toHaveProperty("authorizationId");
  });

  it("falha antes do J32 quando a autorização J38 diverge do plano aprovado", async () => {
    const execute = vi.fn();
    const invalidAuthorization = Object.freeze({
      ...executionAuthorization,
      approvalId: "APR-OUTRO",
    });

    await expect(executeAuthorizedIntegrationProbeOnce({
      approval,
      manualPlan,
      executionAuthorization: invalidAuthorization,
      current,
      nowEpochMs: 140_000,
      executionToken: "EXEC-J42",
      executionDurationMs: 60_000,
      cooldownSeconds: 30,
    }, { executor: { execute } })).rejects.toThrow(/aprova|autoriz/i);

    expect(execute).not.toHaveBeenCalled();
  });
});
