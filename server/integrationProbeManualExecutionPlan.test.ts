import { describe, expect, it } from "vitest";
import {
  buildIntegrationProbeManualExecutionPlan,
  type ProbeManualExecutionPlanInput,
} from "./integrationProbeManualExecutionPlan";

const base: ProbeManualExecutionPlanInput = {
  approval: {
    organizationId: 7,
    system: "neo",
    expectedCircuitVersion: 9,
    requestedAction: "probe_once",
    approvalId: "APR-20261023-001",
    requestedByUserId: 41,
    approvedByUserId: 52,
    approvedAtMs: 1_000,
    expiresAtMs: 601_000,
  },
  administrativeGate: {
    organizationId: 7,
    system: "neo",
    expectedCircuitVersion: 9,
    requestedAction: "probe_once",
    approvalId: "APR-20261023-001",
    status: "eligible_for_manual_execution_plan",
    requiresFreshReconciliation: true,
    requiresExecutionPlan: true,
    permitsProbe: false,
    permitsReplay: false,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  },
  freshReconciliation: {
    organizationId: 7,
    system: "neo",
    expectedCircuitVersion: 9,
    status: "manual_review_required",
    observedAtMs: 100_000,
  },
  planCreatedAtMs: 120_000,
};

describe("D-012J J37 — plano manual imutável antes de qualquer probe", () => {
  it("monta somente um plano de revisão manual, sem conceder permissão de execução", () => {
    const plan = buildIntegrationProbeManualExecutionPlan(base);
    expect(plan).toEqual(expect.objectContaining({
      organizationId: 7,
      system: "neo",
      expectedCircuitVersion: 9,
      approvalId: "APR-20261023-001",
      requestedAction: "probe_once",
      status: "ready_for_manual_operator_review",
      permitsProbe: false,
      permitsReplay: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    }));
    expect(plan.steps).toEqual([
      "verify_scope_and_approval",
      "verify_fresh_reconciliation",
      "verify_circuit_version",
      "prepare_one_shot_intent",
      "require_separate_execution_authorization",
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
  });

  it("falha fechado se o gate administrativo não estiver elegível", () => {
    expect(() => buildIntegrationProbeManualExecutionPlan({
      ...base,
      administrativeGate: {
        ...base.administrativeGate,
        status: "blocked_reconciliation",
      },
    })).toThrow(/gate administrativo|eleg/i);
  });

  it("rejeita reconciliação de outro tenant, sistema ou versão", () => {
    for (const freshReconciliation of [
      { ...base.freshReconciliation, organizationId: 8 },
      { ...base.freshReconciliation, system: "crm" as const },
      { ...base.freshReconciliation, expectedCircuitVersion: 10 },
    ]) {
      expect(() => buildIntegrationProbeManualExecutionPlan({
        ...base,
        freshReconciliation,
      })).toThrow(/escopo|versão|reconcilia/i);
    }
  });

  it("exige reconciliação manual_review_required realmente fresca", () => {
    expect(() => buildIntegrationProbeManualExecutionPlan({
      ...base,
      freshReconciliation: {
        ...base.freshReconciliation,
        status: "circuit_closed_verified",
      },
    })).toThrow(/manual_review_required|reconcilia/i);

    expect(() => buildIntegrationProbeManualExecutionPlan({
      ...base,
      freshReconciliation: {
        ...base.freshReconciliation,
        observedAtMs: 1_000,
      },
      planCreatedAtMs: 200_001,
    })).toThrow(/fresca|expirad|reconcilia/i);
  });

  it("rejeita aprovação expirada, autoaprovação e divergência entre aprovação e gate", () => {
    expect(() => buildIntegrationProbeManualExecutionPlan({
      ...base,
      planCreatedAtMs: 700_000,
    })).toThrow(/aprovação|expirad/i);

    expect(() => buildIntegrationProbeManualExecutionPlan({
      ...base,
      approval: {
        ...base.approval,
        approvedByUserId: base.approval.requestedByUserId,
      },
    })).toThrow(/aprovador|autoaprova/i);

    expect(() => buildIntegrationProbeManualExecutionPlan({
      ...base,
      approval: {
        ...base.approval,
        approvalId: "APR-20261023-XYZ",
      },
    })).toThrow(/aprovação|gate|escopo/i);
  });
});
