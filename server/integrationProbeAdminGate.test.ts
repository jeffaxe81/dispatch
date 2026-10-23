import { afterEach, describe, expect, it } from "vitest";
import {
  assessIntegrationProbeAdministrativeApproval,
  createIntegrationProbeAdminGate,
} from "./integrationProbeAdminGate";

const base = {
  organizationId: 7,
  system: "neo" as const,
  expectedCircuitVersion: 9,
  reconciliationStatus: "manual_review_required" as const,
  requestedAction: "probe_once" as const,
  requestedByUserId: 41,
  approvedByUserId: 52,
  approvalId: "APR-20261023-001",
  reason: "Validação manual controlada em homologação.",
  approvedAtMs: 1_000,
  expiresAtMs: 601_000,
};
const oldEnv = {
  runtime: process.env.AXE_RUNTIME_ENV,
  enabled: process.env.AXE_INTEGRATION_PROBE_J35_ENABLED,
};
afterEach(() => {
  if (oldEnv.runtime === undefined) delete process.env.AXE_RUNTIME_ENV;
  else process.env.AXE_RUNTIME_ENV = oldEnv.runtime;
  if (oldEnv.enabled === undefined) delete process.env.AXE_INTEGRATION_PROBE_J35_ENABLED;
  else process.env.AXE_INTEGRATION_PROBE_J35_ENABLED = oldEnv.enabled;
});

describe("D-012J J36 — gate administrativo consolidado sobre snapshot MySQL-validado", () => {
  it("marca dupla aprovação válida apenas como elegível para plano manual", () => {
    expect(assessIntegrationProbeAdministrativeApproval(base, 100_000)).toEqual({
      organizationId: 7,
      system: "neo",
      expectedCircuitVersion: 9,
      requestedAction: "probe_once",
      status: "eligible_for_manual_execution_plan",
      requiresFreshReconciliation: true,
      requiresExecutionPlan: true,
      permitsProbe: false,
      permitsReplay: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
  });

  it("bloqueia autoaprovação e aprovação expirada", () => {
    expect(assessIntegrationProbeAdministrativeApproval({
      ...base, approvedByUserId: base.requestedByUserId,
    }, 100_000).status).toBe("blocked_self_approval");
    expect(assessIntegrationProbeAdministrativeApproval(base, 700_000).status)
      .toBe("blocked_expired");
  });

  it("não transforma evidência inconclusiva ou avançada em autorização", () => {
    for (const reconciliationStatus of [
      "inconsistent", "history_advanced", "evidence_missing",
      "not_found", "circuit_closed_verified", "circuit_opened_verified",
    ] as const) {
      const result = assessIntegrationProbeAdministrativeApproval({
        ...base, reconciliationStatus,
      }, 100_000);
      expect(result.status).toBe("blocked_reconciliation");
      expect(result.permitsProbe).toBe(false);
      expect(result.permitsExternalCall).toBe(false);
    }
  });

  it("falha fechado para escopo, versão, motivo ou janela inválidos", () => {
    expect(assessIntegrationProbeAdministrativeApproval({
      ...base, organizationId: 0,
    }, 100_000).status).toBe("blocked_invalid");
    expect(assessIntegrationProbeAdministrativeApproval({
      ...base, expectedCircuitVersion: 0,
    }, 100_000).status).toBe("blocked_invalid");
    expect(assessIntegrationProbeAdministrativeApproval({
      ...base, reason: "curto",
    }, 100_000).status).toBe("blocked_invalid");
    expect(assessIntegrationProbeAdministrativeApproval({
      ...base, expiresAtMs: base.approvedAtMs + 901_000,
    }, 100_000).status).toBe("blocked_invalid");
  });

  it("gate de serviço só existe em teste/homologação opt-in", () => {
    delete process.env.AXE_INTEGRATION_PROBE_J35_ENABLED;
    process.env.AXE_RUNTIME_ENV = "homologation";
    expect(() => createIntegrationProbeAdminGate().assess(base, 100_000))
      .toThrow(/desabilitad|homologa/i);

    process.env.AXE_INTEGRATION_PROBE_J35_ENABLED = "true";
    expect(createIntegrationProbeAdminGate().assess(base, 100_000).status)
      .toBe("eligible_for_manual_execution_plan");
  });
});
