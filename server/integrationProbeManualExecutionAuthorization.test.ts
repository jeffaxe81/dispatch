import { describe, expect, it } from "vitest";
import type {
  ProbeManualExecutionApproval,
  ProbeManualExecutionPlan,
} from "./integrationProbeManualExecutionPlan";
import {
  authorizeIntegrationProbeOneShotIntentIssue,
  type ProbeOneShotIntentIssueAuthorizationInput,
} from "./integrationProbeManualExecutionAuthorization";

const approval: ProbeManualExecutionApproval = {
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  requestedAction: "probe_once",
  approvalId: "APR-20261023-001",
  requestedByUserId: 41,
  approvedByUserId: 52,
  approvedAtMs: 1_000,
  expiresAtMs: 601_000,
};

const plan: ProbeManualExecutionPlan = Object.freeze({
  organizationId: 7,
  system: "neo",
  expectedCircuitVersion: 9,
  approvalId: "APR-20261023-001",
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

const base: ProbeOneShotIntentIssueAuthorizationInput = {
  approval,
  manualPlan: plan,
  executionAuthorization: {
    organizationId: 7,
    system: "neo",
    expectedCircuitVersion: 9,
    approvalId: "APR-20261023-001",
    authorizationId: "EXE-AUTH-20261023-001",
    action: "issue_one_shot_probe_intent",
    authorizedByUserId: 63,
    authorizedAtMs: 130_000,
    expiresAtMs: 310_000,
  },
  evaluatedAtMs: 140_000,
};

describe("D-012J J38 — autorização separada antes da intenção one-shot", () => {
  it("autoriza somente a emissão futura da intenção, sem autorizar probe ou chamada externa", () => {
    const result = authorizeIntegrationProbeOneShotIntentIssue(base);
    expect(result).toEqual({
      organizationId: 7,
      system: "neo",
      expectedCircuitVersion: 9,
      approvalId: "APR-20261023-001",
      authorizationId: "EXE-AUTH-20261023-001",
      status: "authorized_to_issue_one_shot_intent",
      permitsIntentIssue: true,
      permitsProbe: false,
      permitsReplay: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejeita autorização feita pelo solicitante ou aprovador anterior", () => {
    for (const authorizedByUserId of [
      approval.requestedByUserId,
      approval.approvedByUserId,
    ]) {
      expect(() => authorizeIntegrationProbeOneShotIntentIssue({
        ...base,
        executionAuthorization: {
          ...base.executionAuthorization,
          authorizedByUserId,
        },
      })).toThrow(/separad|autoriza|solicitante|aprovador/i);
    }
  });

  it("rejeita plano, aprovação ou autorização com escopo e versão divergentes", () => {
    expect(() => authorizeIntegrationProbeOneShotIntentIssue({
      ...base,
      manualPlan: { ...plan, expectedCircuitVersion: 10 },
    })).toThrow(/plano|escopo|versão/i);

    expect(() => authorizeIntegrationProbeOneShotIntentIssue({
      ...base,
      executionAuthorization: {
        ...base.executionAuthorization,
        organizationId: 8,
      },
    })).toThrow(/autoriza|escopo|tenant/i);

    expect(() => authorizeIntegrationProbeOneShotIntentIssue({
      ...base,
      executionAuthorization: {
        ...base.executionAuthorization,
        approvalId: "APR-20261023-XYZ",
      },
    })).toThrow(/aprovação|autoriza|escopo/i);
  });

  it("rejeita plano que já carregue qualquer permissão de execução", () => {
    expect(() => authorizeIntegrationProbeOneShotIntentIssue({
      ...base,
      manualPlan: { ...plan, permitsProbe: true } as ProbeManualExecutionPlan,
    })).toThrow(/plano|permiss/i);
  });

  it("falha fechado com autorização expirada, futura ou janela excessiva", () => {
    expect(() => authorizeIntegrationProbeOneShotIntentIssue({
      ...base,
      evaluatedAtMs: 400_000,
    })).toThrow(/expirad|autoriza/i);

    expect(() => authorizeIntegrationProbeOneShotIntentIssue({
      ...base,
      executionAuthorization: {
        ...base.executionAuthorization,
        authorizedAtMs: 150_000,
      },
      evaluatedAtMs: 140_000,
    })).toThrow(/futur|autoriza|instante/i);

    expect(() => authorizeIntegrationProbeOneShotIntentIssue({
      ...base,
      executionAuthorization: {
        ...base.executionAuthorization,
        expiresAtMs: 500_001,
      },
    })).toThrow(/janela|autoriza|expira/i);
  });

  it("não confunde autorização de emissão com autorização de execução", () => {
    const result = authorizeIntegrationProbeOneShotIntentIssue(base);
    expect(result.permitsIntentIssue).toBe(true);
    expect(result.permitsProbe).toBe(false);
    expect(result.permitsExternalCall).toBe(false);
    expect(result.permitsReplay).toBe(false);
    expect(result.permitsAutomaticReplay).toBe(false);
  });
});
