import { describe, expect, it } from "vitest";
import {
  classifyIntegrationRecoveryAudit,
  type RecoveryAuditEntry,
  type RecoveryAuditState,
} from "./integrationOutboxRecoveryAuditVerifier";

const NOW = Date.parse("2026-10-23T01:00:10.000Z");
const state: RecoveryAuditState = {
  deliveryId: 71, organizationId: 7, system: "neo",
  status: "dead_letter", version: 2, attempts: 1,
  correlationId: "corr-71", lastFailureKind: "unknown",
  deadLetteredAtMs: NOW,
};
const audit: RecoveryAuditEntry = {
  resourceId: 71, actorUserId: 42,
  beforeData: {
    organizationId: 7, system: "neo", correlationId: "corr-71",
    status: "leased", deliveryVersion: 1, attempts: 1,
  },
  afterData: {
    organizationId: 7, system: "neo", correlationId: "corr-71",
    status: "dead_letter", deliveryVersion: 2,
    reasonCode: "delivery_outcome_unknown", ticketReference: "INC-12345",
    evaluatedAtEpochMs: NOW, remoteOutcome: "unknown",
  },
};

describe("D-012J J21 — evidência de recuperação com escopo e sanitização", () => {
  it("verifica os metadados de auditoria correspondentes ao CAS sem autorizar replay", () => {
    expect(classifyIntegrationRecoveryAudit(state, [audit])).toEqual({
      organizationId: 7, deliveryId: 71, status: "verified", permitsReplay: false,
    });
  });

  it("classifica ausência de auditoria como missing, não como aprovação de retry", () => {
    expect(classifyIntegrationRecoveryAudit(state, [])).toEqual({
      organizationId: 7, deliveryId: 71, status: "missing", permitsReplay: false,
    });
  });

  it("rejeita auditorias duplicadas, ator inativo ou registro de outra entrega", () => {
    expect(classifyIntegrationRecoveryAudit(state, [audit, audit]).status).toBe("inconsistent");
    expect(classifyIntegrationRecoveryAudit(state, [{
      ...audit, actorUserId: null,
    }]).status).toBe("inconsistent");
    expect(classifyIntegrationRecoveryAudit(state, [{
      ...audit, resourceId: 72,
    }]).status).toBe("inconsistent");
  });

  it("nega outro tenant, correlação divergente e versão CAS incompatível", () => {
    for (const patch of [
      { organizationId: 8 },
      { correlationId: "wrong-correlation" },
      { deliveryVersion: 5 },
    ]) {
      const changed = { ...audit, afterData: { ...audit.afterData, ...patch } };
      expect(classifyIntegrationRecoveryAudit(state, [changed]).status).toBe("inconsistent");
    }
  });

  it("não considera verificada evidência contendo payload, tokens ou erro bruto", () => {
    for (const payload of [
      { payloadReference: "vault:ref-71" },
      { leaseToken: "secret" },
      { errorMessage: "Authorization: Bearer secret" },
    ]) {
      const changed = { ...audit, afterData: { ...audit.afterData, ...payload } };
      expect(classifyIntegrationRecoveryAudit(state, [changed]).status).toBe("inconsistent");
    }
  });

  it("não exige auditoria J20 em entregas que não são quarentena administrativa", () => {
    expect(classifyIntegrationRecoveryAudit({
      ...state, status: "delivered", lastFailureKind: null, deadLetteredAtMs: null,
    }, []).status).toBe("not_applicable");
    expect(classifyIntegrationRecoveryAudit({
      ...state, lastFailureKind: "timeout",
    }, []).status).toBe("not_applicable");
  });

  it("bloqueia timestamps divergentes, motivos livres e chamados sem formato", () => {
    for (const patch of [
      { evaluatedAtEpochMs: NOW + 1 },
      { reasonCode: "Bearer admin-secret" },
      { ticketReference: "customer phone +5548" },
    ]) {
      const changed = { ...audit, afterData: { ...audit.afterData, ...patch } };
      expect(classifyIntegrationRecoveryAudit(state, [changed]).status).toBe("inconsistent");
    }
  });

  it("falha fechado para ID inválido ou estado inconsistente", () => {
    expect(() => classifyIntegrationRecoveryAudit({
      ...state, organizationId: 0,
    }, [])).toThrow(/inválido/i);
    expect(classifyIntegrationRecoveryAudit({
      ...state, deadLetteredAtMs: null,
    }, []).status).toBe("inconsistent");
  });

  it("retorna somente status e identificadores de escopo, nunca dados da integração", () => {
    const result = classifyIntegrationRecoveryAudit(state, [audit]);
    for (const key of [
      "correlationId", "beforeData", "afterData", "actorUserId", "leaseToken",
      "payload", "payloadReference", "ticketReference", "remoteOutcome",
    ]) expect(result).not.toHaveProperty(key);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
