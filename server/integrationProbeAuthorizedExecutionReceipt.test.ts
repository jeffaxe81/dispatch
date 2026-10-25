import { describe, expect, it, vi } from "vitest";
import type { IntegrationProbeExecutionSnapshot } from "./integrationCircuitProbeExecutionIntent";
import type { ProbeOneShotIntentIssueAuthorization } from "./integrationProbeManualExecutionAuthorization";
import type { ProbeManualExecutionApproval, ProbeManualExecutionPlan } from "./integrationProbeManualExecutionPlan";
import { executeAuthorizedIntegrationProbeOnceWithReceipt } from "./integrationProbeAuthorizedExecutionReceipt";

const approval: ProbeManualExecutionApproval = Object.freeze({
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  requestedAction: "probe_once",
  approvalId: "APR-J43-001",
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
  authorizationId: "EXE-AUTH-J43-001",
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
  leaseOwner: "probe-worker-j43",
  leaseToken: "LEASE-J43",
  leaseExpiresAtMs: 300_000,
  executionToken: null,
  executionExpiresAtMs: null,
  executionConsumedAtMs: null,
});

const input = Object.freeze({
  approval,
  manualPlan,
  executionAuthorization,
  current,
  nowEpochMs: 140_000,
  executionToken: "EXEC-J43",
  executionDurationMs: 60_000,
  cooldownSeconds: 30,
});

describe("D-012J J43 — recibo sanitizado de execução autorizada", () => {
  it("rejeita resultado executivo cujo tenant diverge do escopo aprovado", async () => {
    const execute = vi.fn(async () => Object.freeze({
      organizationId: 99,
      system: "neo" as const,
      state: "closed" as const,
      version: 12,
      consecutiveFailures: 0,
      openedAtMs: null,
      cooldownUntilMs: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAtMs: null,
      executionToken: null,
      executionExpiresAtMs: null,
      executionConsumedAtMs: 141_000,
      permitsProbe: false as const,
      permitsExternalCall: false as const,
      permitsAutomaticReplay: false as const,
    }));

    await expect(executeAuthorizedIntegrationProbeOnceWithReceipt(
      "EXECUTION-J43-001",
      input,
      { executor: { execute } },
      { now: vi.fn().mockReturnValueOnce(140_000).mockReturnValueOnce(141_000) },
    )).rejects.toThrow(/organiza|tenant|escopo/i);
  });

  it("rejeita resultado executivo cujo sistema diverge do escopo aprovado", async () => {
    const execute = vi.fn(async () => Object.freeze({
      organizationId: 7,
      system: "crm" as const,
      state: "closed" as const,
      version: 12,
      consecutiveFailures: 0,
      openedAtMs: null,
      cooldownUntilMs: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAtMs: null,
      executionToken: null,
      executionExpiresAtMs: null,
      executionConsumedAtMs: 141_000,
      permitsProbe: false as const,
      permitsExternalCall: false as const,
      permitsAutomaticReplay: false as const,
    }));

    await expect(executeAuthorizedIntegrationProbeOnceWithReceipt(
      "EXECUTION-J43-002",
      input,
      { executor: { execute } },
      { now: vi.fn().mockReturnValueOnce(140_000).mockReturnValueOnce(141_000) },
    )).rejects.toThrow(/sistema|escopo/i);
  });

  it("mantém o recibo sem tokens e identificadores administrativos", async () => {
    const execute = vi.fn(async () => Object.freeze({
      organizationId: 7,
      system: "neo" as const,
      state: "closed" as const,
      version: 12,
      consecutiveFailures: 0,
      openedAtMs: null,
      cooldownUntilMs: null,
      leaseOwner: null,
      leaseToken: "NAO-VAZAR",
      leaseExpiresAtMs: null,
      executionToken: "NAO-VAZAR",
      executionExpiresAtMs: null,
      executionConsumedAtMs: 141_000,
      approvalId: approval.approvalId,
      authorizationId: executionAuthorization.authorizationId,
      permitsProbe: false as const,
      permitsExternalCall: false as const,
      permitsAutomaticReplay: false as const,
    }));

    const execution = await executeAuthorizedIntegrationProbeOnceWithReceipt(
      "EXECUTION-J43-003",
      input,
      { executor: { execute } },
      { now: vi.fn().mockReturnValueOnce(140_000).mockReturnValueOnce(141_000) },
    );

    expect(execution.receipt).toMatchObject({
      executionId: "EXECUTION-J43-003",
      organizationId: 7,
      system: "neo",
      state: "closed",
      version: 12,
      executedAtMs: 141_000,
      durationMs: 1_000,
      outcome: "success",
    });
    expect(execution.receipt).not.toHaveProperty("leaseToken");
    expect(execution.receipt).not.toHaveProperty("executionToken");
    expect(execution.receipt).not.toHaveProperty("approvalId");
    expect(execution.receipt).not.toHaveProperty("authorizationId");
  });
});
