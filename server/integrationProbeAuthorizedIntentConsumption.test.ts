import { describe, expect, it } from "vitest";
import type { ProbeManualExecutionApproval, ProbeManualExecutionPlan } from "./integrationProbeManualExecutionPlan";
import type { ProbeOneShotIntentIssueAuthorization } from "./integrationProbeManualExecutionAuthorization";
import {
  issueAuthorizedIntegrationProbeOneShotIntent,
  type AuthorizedProbeOneShotIntentIssueResult,
} from "./integrationProbeAuthorizedIntentIssue";
import { prepareAuthorizedIntegrationProbeExecutionHandoff } from "./integrationProbeAuthorizedIntentConsumption";

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

function issued(): AuthorizedProbeOneShotIntentIssueResult {
  return issueAuthorizedIntegrationProbeOneShotIntent({
    approval,
    manualPlan,
    executionAuthorization,
    current: Object.freeze({
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
    }),
    nowEpochMs: 140_000,
    executionToken: "EXEC-20261024-001",
    executionDurationMs: 60_000,
  });
}

describe("D-012J J40 — handoff autorizado para consumo atômico no J32", () => {
  it("prepara exatamente o input do executor sem consumir a intenção nem liberar probe", () => {
    const current = issued();
    const result = prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current,
      nowEpochMs: 150_000,
      cooldownSeconds: 30,
    });

    expect(result).toEqual({
      organizationId: 7,
      system: "neo",
      expectedVersion: 10,
      leaseToken: "LEASE-20261024-001",
      executionToken: "EXEC-20261024-001",
      cooldownSeconds: 30,
      approvalId: approval.approvalId,
      authorizationId: executionAuthorization.authorizationId,
      status: "ready_for_j32_atomic_consumption",
      validUntilMs: 200_000,
      permitsProbe: false,
      permitsReplay: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(current.executionConsumedAtMs).toBeNull();
    expect(current.permitsProbe).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("é idempotente e não muta o snapshot emitido", () => {
    const current = issued();
    const first = prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current,
      nowEpochMs: 150_000,
      cooldownSeconds: 30,
    });
    const second = prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current,
      nowEpochMs: 150_000,
      cooldownSeconds: 30,
    });
    expect(second).toEqual(first);
    expect(current.executionConsumedAtMs).toBeNull();
  });

  it("revalida autorização J38 e rejeita intenção expirada ou já consumida", () => {
    expect(() => prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current: issued(),
      nowEpochMs: 320_000,
      cooldownSeconds: 30,
    })).toThrow(/expirad|autoriza|intenção/i);

    expect(() => prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current: { ...issued(), executionConsumedAtMs: 149_000 },
      nowEpochMs: 150_000,
      cooldownSeconds: 30,
    })).toThrow(/consumid|one-shot/i);
  });

  it("rejeita metadados adulterados e cooldown inválido", () => {
    expect(() => prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current: { ...issued(), authorizationId: "EXE-AUTH-20261024-XYZ" },
      nowEpochMs: 150_000,
      cooldownSeconds: 30,
    })).toThrow(/autoriza|escopo|identificador/i);

    expect(() => prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current: issued(),
      nowEpochMs: 150_000,
      cooldownSeconds: 0,
    })).toThrow(/cooldown/i);
  });

  it("não executa adapter, não consome grant e não concede replay ou chamada externa", () => {
    const result = prepareAuthorizedIntegrationProbeExecutionHandoff({
      approval,
      manualPlan,
      executionAuthorization,
      current: issued(),
      nowEpochMs: 150_000,
      cooldownSeconds: 30,
    });
    expect(result.permitsProbe).toBe(false);
    expect(result.permitsExternalCall).toBe(false);
    expect(result.permitsReplay).toBe(false);
    expect(result.permitsAutomaticReplay).toBe(false);
  });
});
