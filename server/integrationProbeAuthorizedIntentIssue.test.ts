import { describe, expect, it } from "vitest";
import type { IntegrationProbeExecutionSnapshot } from "./integrationCircuitProbeExecutionIntent";
import type { ProbeManualExecutionApproval, ProbeManualExecutionPlan } from "./integrationProbeManualExecutionPlan";
import type { ProbeOneShotIntentIssueAuthorization } from "./integrationProbeManualExecutionAuthorization";
import { issueAuthorizedIntegrationProbeOneShotIntent } from "./integrationProbeAuthorizedIntentIssue";

const approval: ProbeManualExecutionApproval = {
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  requestedAction: "probe_once",
  approvalId: "APR-20261024-001",
  requestedByUserId: 41,
  approvedByUserId: 52,
  approvedAtMs: 1_000,
  expiresAtMs: 601_000,
};

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
  authorizationId: "EXE-AUTH-20261024-001",
  action: "issue_one_shot_probe_intent",
  authorizedByUserId: 63,
  authorizedAtMs: 130_000,
  expiresAtMs: 310_000,
});

const snapshot: IntegrationProbeExecutionSnapshot = Object.freeze({
  organizationId: 7,
  system: "neo",
  circuitState: "half_open",
  circuitVersion: 9,
  leaseOwner: "probe-worker-1",
  leaseToken: "LEASE-20261024-001",
  leaseExpiresAtMs: 300_000,
  executionToken: null,
  executionExpiresAtMs: null,
  executionConsumedAtMs: null,
});

describe("D-012J J39 — emissão autorizada da intenção one-shot", () => {
  it("emite somente a intenção J31 após autorização J38 válida, sem liberar execução", () => {
    const result = issueAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: snapshot,
      nowEpochMs: 140_000,
      executionToken: "EXEC-20261024-001",
      executionDurationMs: 60_000,
    });

    expect(result).toEqual(expect.objectContaining({
      organizationId: 7,
      system: "neo",
      circuitVersion: 10,
      executionToken: "EXEC-20261024-001",
      executionExpiresAtMs: 200_000,
      executionConsumedAtMs: null,
      authorizationId: "EXE-AUTH-20261024-001",
      approvalId: "APR-20261024-001",
      status: "one_shot_intent_issued",
      permitsProbe: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    }));
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejeita autorização J38 divergente do snapshot ou já expirada", () => {
    expect(() => issueAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization: { ...executionAuthorization, expectedCircuitVersion: 10 },
      current: snapshot,
      nowEpochMs: 140_000,
      executionToken: "EXEC-20261024-002",
      executionDurationMs: 60_000,
    })).toThrow(/autoriza|versão|escopo/i);

    expect(() => issueAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: snapshot,
      nowEpochMs: 320_000,
      executionToken: "EXEC-20261024-003",
      executionDurationMs: 10_000,
    })).toThrow(/expirad|autoriza/i);
  });

  it("rejeita snapshot fora do tenant/sistema/versão autorizados e intenção que ultrapasse a autorização", () => {
    expect(() => issueAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: { ...snapshot, organizationId: 8 },
      nowEpochMs: 140_000,
      executionToken: "EXEC-20261024-004",
      executionDurationMs: 60_000,
    })).toThrow(/tenant|escopo|organiza/i);

    expect(() => issueAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: snapshot,
      nowEpochMs: 290_000,
      executionToken: "EXEC-20261024-005",
      executionDurationMs: 20_001,
    })).toThrow(/autoriza|expira|janela/i);
  });

  it("não consome a intenção e não executa probe, replay ou chamada externa", () => {
    const result = issueAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: snapshot,
      nowEpochMs: 140_000,
      executionToken: "EXEC-20261024-006",
      executionDurationMs: 30_000,
    });
    expect(result.executionConsumedAtMs).toBeNull();
    expect(result.permitsProbe).toBe(false);
    expect(result.permitsExternalCall).toBe(false);
    expect((result as any).permitsReplay ?? false).toBe(false);
    expect(result.permitsAutomaticReplay).toBe(false);
  });
});
