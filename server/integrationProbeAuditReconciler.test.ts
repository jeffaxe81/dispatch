import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyIntegrationProbeAudit,
  createIntegrationProbeAuditReconciler,
  type CircuitProbeAuditState,
  type CircuitProbeAuditEntry,
} from "./integrationProbeAuditReconciler";

const input = { organizationId: 7, system: "neo" as const, expectedConsumedVersion: 8 };
const consumed: CircuitProbeAuditState = {
  id: 71, organizationId: 7, system: "neo", state: "half_open",
  version: 8, consecutiveFailures: 3, executionConsumedAtMs: 41_000,
};
const closed: CircuitProbeAuditState = {
  ...consumed, state: "closed", version: 9,
  consecutiveFailures: 0, executionConsumedAtMs: null,
};
const opened: CircuitProbeAuditState = {
  ...consumed, state: "open", version: 9,
  consecutiveFailures: 4, executionConsumedAtMs: null,
};
function audit(action: string, beforeVersion: number, afterVersion: number,
  beforeState = "half_open", afterState = "half_open",
  beforeFailures = 3, afterFailures = 3): CircuitProbeAuditEntry {
  return {
    resourceId: 71, action,
    beforeData: { organizationId: 7, system: "neo", state: beforeState,
      version: beforeVersion, consecutiveFailures: beforeFailures },
    afterData: { organizationId: 7, system: "neo", state: afterState,
      version: afterVersion, consecutiveFailures: afterFailures },
  };
}
const consumedAudit = audit("integration.circuit.probe_intent.consumed", 7, 8);
const successAudit = audit("integration.circuit.probe.succeeded", 8, 9,
  "half_open", "closed", 3, 0);
const failureAudit = audit("integration.circuit.probe.failed", 8, 9,
  "half_open", "open", 3, 4);
const initialEnv = {
  runtime: process.env.AXE_RUNTIME_ENV,
  enabled: process.env.AXE_INTEGRATION_PROBE_J33_ENABLED,
};
afterEach(() => {
  if (initialEnv.runtime === undefined) delete process.env.AXE_RUNTIME_ENV;
  else process.env.AXE_RUNTIME_ENV = initialEnv.runtime;
  if (initialEnv.enabled === undefined) delete process.env.AXE_INTEGRATION_PROBE_J33_ENABLED;
  else process.env.AXE_INTEGRATION_PROBE_J33_ENABLED = initialEnv.enabled;
});
function enable() {
  process.env.AXE_RUNTIME_ENV = "homologation";
  process.env.AXE_INTEGRATION_PROBE_J33_ENABLED = "true";
}

describe("D-012J J33 — reconciliação passiva de evidência do probe", () => {
  it("reconhece grant consumido sem desfecho comprovado como revisão manual", () => {
    expect(classifyIntegrationProbeAudit(input, consumed, [consumedAudit])).toMatchObject({
      status: "manual_review_required", permitsProbe: false,
      permitsExternalCall: false, permitsAutomaticReplay: false, permitsReplay: false,
    });
  });

  it("confirma apenas transição fechada quando as duas auditorias e CAS coincidem", () => {
    expect(classifyIntegrationProbeAudit(input, closed, [successAudit, consumedAudit]).status)
      .toBe("circuit_closed_verified");
  });

  it("confirma reabertura do circuito com prova auditada, sem habilitar replay", () => {
    expect(classifyIntegrationProbeAudit(input, opened, [failureAudit, consumedAudit]).status)
      .toBe("circuit_opened_verified");
  });

  it("ausência da evidência não inventa conclusão nem concede tentativa", () => {
    expect(classifyIntegrationProbeAudit(input, consumed, []).status).toBe("evidence_missing");
    expect(classifyIntegrationProbeAudit(input, closed, [consumedAudit]).status).toBe("evidence_missing");
    expect(classifyIntegrationProbeAudit(input, null, []).status).toBe("not_found");
  });

  it("rejeita prova duplicada, estado final errado e mudança de tenant", () => {
    expect(classifyIntegrationProbeAudit(input, closed, [
      consumedAudit, successAudit, successAudit,
    ]).status).toBe("inconsistent");
    expect(classifyIntegrationProbeAudit(input, closed, [
      consumedAudit, failureAudit,
    ]).status).toBe("inconsistent");
    expect(classifyIntegrationProbeAudit(input, closed, [{
      ...consumedAudit,
      afterData: { ...consumedAudit.afterData, organizationId: 8 },
    }]).status).toBe("inconsistent");
  });

  it("bloqueia audit contaminado com dados sensíveis e versão incompatível", () => {
    expect(classifyIntegrationProbeAudit(input, consumed, [{
      ...consumedAudit,
      afterData: { ...consumedAudit.afterData, leaseToken: "private-secret" },
    }]).status).toBe("inconsistent");
    expect(classifyIntegrationProbeAudit(input, consumed, [{
      ...consumedAudit, beforeData: { ...consumedAudit.beforeData, version: 3 },
    }]).status).toBe("inconsistent");
  });

  it("histórico avançado não é confundido com a resolução do probe original", () => {
    expect(classifyIntegrationProbeAudit(input, {
      ...closed, version: 12,
    }, [consumedAudit, successAudit]).status).toBe("history_advanced");
  });

  it("não admite relógio, id, versão ou escopo inválidos", () => {
    expect(() => classifyIntegrationProbeAudit({
      ...input, organizationId: 0,
    }, consumed, [consumedAudit])).toThrow(/inválid/i);
    expect(classifyIntegrationProbeAudit(input, {
      ...consumed, executionConsumedAtMs: -1,
    }, [consumedAudit]).status).toBe("inconsistent");
  });

  it("gate desabilitado impede até a leitura do banco e preserva sanitização", async () => {
    delete process.env.AXE_INTEGRATION_PROBE_J33_ENABLED;
    process.env.AXE_RUNTIME_ENV = "homologation";
    const load = vi.fn(async () => consumed);
    const readAudit = vi.fn(async () => [consumedAudit]);
    const reconciler = createIntegrationProbeAuditReconciler({ load, readAudit });
    await expect(reconciler.reconcile(input)).rejects.toThrow(/desabilitad|homologa/i);
    expect(load).not.toHaveBeenCalled();
    expect(readAudit).not.toHaveBeenCalled();

    enable();
    load.mockRejectedValueOnce(new Error("Bearer private-storage-secret"));
    const err = await reconciler.reconcile(input).catch((error: unknown) => error);
    expect(String(err)).not.toContain("private-storage-secret");
  });

  it("consulta apenas circuito tenant-scoped e auditorias do recurso retornado", async () => {
    enable();
    const load = vi.fn(async () => consumed);
    const readAudit = vi.fn(async () => [consumedAudit]);
    const reconciler = createIntegrationProbeAuditReconciler({ load, readAudit });
    const result = await reconciler.reconcile(input);
    expect(load).toHaveBeenCalledWith({ organizationId: 7, system: "neo" });
    expect(readAudit).toHaveBeenCalledWith({ resourceId: 71 });
    expect(result).toEqual({
      organizationId: 7, system: "neo", expectedConsumedVersion: 8,
      status: "manual_review_required", permitsProbe: false,
      permitsExternalCall: false, permitsAutomaticReplay: false, permitsReplay: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/token|secret|payload/i);
  });

  it("falha fechado se o reader devolver outro tenant, resultados truncados ou duplicados", async () => {
    enable();
    const reconciler = createIntegrationProbeAuditReconciler({
      load: async () => ({ ...consumed, organizationId: 8 }),
      readAudit: async () => [consumedAudit],
    });
    await expect(reconciler.reconcile(input)).rejects.toThrow(/indisponível|inconsistente/i);

    const trunc = createIntegrationProbeAuditReconciler({
      load: async () => consumed,
      readAudit: async () => Array.from({ length: 200 }, () => consumedAudit),
    });
    expect((await trunc.reconcile(input)).status).toBe("inconsistent");
  });
});
