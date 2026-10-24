import { describe, expect, it } from "vitest";
import type { ProbeManualExecutionApproval, ProbeManualExecutionPlan } from "./integrationProbeManualExecutionPlan";
import type { ProbeOneShotIntentIssueAuthorization } from "./integrationProbeManualExecutionAuthorization";
import {
  issueAuthorizedIntegrationProbeOneShotIntent,
  type AuthorizedProbeOneShotIntentIssueResult,
} from "./integrationProbeAuthorizedIntentIssue";
import { consumeAuthorizedIntegrationProbeOneShotIntent } from "./integrationProbeAuthorizedIntentConsumption";

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

describe("D-012J J40 — consumo autorizado da intenção one-shot", () => {
  it("consome uma única vez e libera somente o grant interno de probe", () => {
    const current = issued();
    const result = consumeAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current,
      nowEpochMs: 150_000,
    });

    expect(result).toEqual(expect.objectContaining({
      organizationId: 7,
      system: "neo",
      circuitVersion: 11,
      approvalId: approval.approvalId,
      authorizationId: executionAuthorization.authorizationId,
      status: "one_shot_intent_consumed_for_probe_grant",
      executionToken: "EXEC-20261024-001",
      executionConsumedAtMs: 150_000,
      permitsProbe: true,
      permitsReplay: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    }));
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejeita reconsumo da mesma intenção", () => {
    const first = consumeAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: issued(),
      nowEpochMs: 150_000,
    });
    expect(() => consumeAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: first,
      nowEpochMs: 151_000,
    })).toThrow(/consumid|one-shot/i);
  });

  it("revalida autorização J38 no instante do consumo", () => {
    expect(() => consumeAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: issued(),
      nowEpochMs: 320_000,
    })).toThrow(/expirad|autoriza/i);
  });

  it("rejeita metadados de aprovação/autorização adulterados", () => {
    expect(() => consumeAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: { ...issued(), authorizationId: "EXE-AUTH-20261024-XYZ" },
      nowEpochMs: 150_000,
    })).toThrow(/autoriza|escopo|identificador/i);

    expect(() => consumeAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: { ...issued(), approvalId: "APR-20261024-XYZ" },
      nowEpochMs: 150_000,
    })).toThrow(/aprovação|escopo|identificador/i);
  });

  it("não concede replay nem chamada externa e não executa adapter algum", () => {
    const result = consumeAuthorizedIntegrationProbeOneShotIntent({
      approval,
      manualPlan,
      executionAuthorization,
      current: issued(),
      nowEpochMs: 150_000,
    });
    expect(result.permitsProbe).toBe(true);
    expect(result.permitsExternalCall).toBe(false);
    expect(result.permitsReplay).toBe(false);
    expect(result.permitsAutomaticReplay).toBe(false);
  });
});
