import { describe, expect, it } from "vitest";
import type { IntegrationOutboxSnapshot } from "./integrationOutboxCas";
import {
  prepareIntegrationLeaseRecoveryApproval,
  type IntegrationRecoveryApprovalInput,
} from "./integrationOutboxRecoveryApproval";

const NOW = Date.parse("2026-10-23T00:30:00.000Z");
const delivery: IntegrationOutboxSnapshot = {
  deliveryId: 71, organizationId: 7, system: "crm", contractVersion: 1,
  mode: "event", operation: "contact.updated", messageId: "msg-71",
  idempotencyKey: "v1:7:crm:contact.updated:msg-71",
  correlationId: "corr-71", status: "leased", version: 2,
  attempts: 1, maxAttempts: 5, failureThreshold: 3, cooldownSeconds: 30,
  leaseOwner: "worker-old", leaseToken: "hidden-fencing-secret",
  leaseExpiresAtMs: NOW, nextAttemptAtMs: null,
  deliveredAtMs: null, deadLetteredAtMs: null,
  payloadReference: "vault:payload-71", lastFailureKind: null,
};

const globalAdmin = {
  roleCode: "administrador", defaultScope: "global" as const,
  organizationId: null, organizationalUnitId: null, teamId: null,
};
const tenantAdmin = {
  roleCode: "administrador", defaultScope: "organizacao" as const,
  organizationId: 7, organizationalUnitId: null, teamId: null,
};
const base: IntegrationRecoveryApprovalInput = {
  actor: {
    userId: 42, active: true,
    assignments: [tenantAdmin],
    permissionCodes: ["workflow.execute", "integrations.recover"],
  },
  resolvedOrganizationId: 7,
  delivery,
  expectedVersion: 2,
  nowEpochMs: NOW,
  reasonCode: "delivery_outcome_unknown",
  ticketReference: "INC-12345",
};

describe("D-012J J19 — pré-autorização de recuperação e evidência sanitizada", () => {
  it("permite preparar solicitação de quarentena para admin tenant-scoped e lease expirado", () => {
    expect(prepareIntegrationLeaseRecoveryApproval(base)).toEqual({
      decision: "eligible_for_audited_transaction",
      operation: "integration.outbox.expired_lease.quarantine",
      organizationId: 7,
      deliveryId: 71,
      expectedVersion: 2,
      actorUserId: 42,
      system: "crm",
      correlationId: "corr-71",
      reasonCode: "delivery_outcome_unknown",
      ticketReference: "INC-12345",
      evaluatedAtEpochMs: NOW,
      executionAuthorized: false,
      requiresTransactionalAudit: true,
    });
  });

  it("aceita administrador global apenas dentro da organização resolvida no servidor", () => {
    expect(prepareIntegrationLeaseRecoveryApproval({
      ...base, actor: { ...base.actor, assignments: [globalAdmin] },
    }).organizationId).toBe(7);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, actor: { ...base.actor, assignments: [globalAdmin] },
      resolvedOrganizationId: 8,
    })).toThrow(/escopo|organiza/i);
  });

  it("rejeita usuário inativo, sem ator válido ou somente supervisor", () => {
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, actor: { ...base.actor, active: false },
    })).toThrow(/inativo/i);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, actor: { ...base.actor, userId: 0 },
    })).toThrow(/ator/i);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, actor: {
        ...base.actor,
        assignments: [{ ...tenantAdmin, roleCode: "supervisor" }],
      },
    })).toThrow(/administrador/i);
  });

  it("rejeita admin de outro tenant, unidade e equipe, mesmo com permissões", () => {
    for (const assignment of [
      { ...tenantAdmin, organizationId: 8 },
      { ...tenantAdmin, defaultScope: "unidade" as const },
      { ...tenantAdmin, defaultScope: "equipe" as const },
    ]) {
      expect(() => prepareIntegrationLeaseRecoveryApproval({
        ...base, actor: { ...base.actor, assignments: [assignment] },
      })).toThrow(/administrador|escopo/i);
    }
  });

  it("exige duas permissões dinâmicas explícitas e não aceita wildcard ou legado", () => {
    for (const permissionCodes of [
      ["workflow.execute"],
      ["integrations.recover"],
      ["*"],
      [],
    ]) {
      expect(() => prepareIntegrationLeaseRecoveryApproval({
        ...base, actor: { ...base.actor, permissionCodes },
      })).toThrow(/permiss/i);
    }
  });

  it("falha fechado para org divergente, ID, versão ou estado terminal", () => {
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, resolvedOrganizationId: 0,
    })).toThrow(/organiza/i);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, delivery: { ...delivery, organizationId: 8 },
    })).toThrow(/escopo|organiza/i);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, expectedVersion: 1,
    })).toThrow(/versão/i);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, delivery: {
        ...delivery, status: "dead_letter", leaseOwner: null,
        leaseToken: null, leaseExpiresAtMs: null, deadLetteredAtMs: NOW,
      },
    })).toThrow(/leased|reservad/i);
  });

  it("rejeita relógio inválido ou lease ainda não expirado", () => {
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, nowEpochMs: NOW - 1,
    })).toThrow(/expirad/i);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, nowEpochMs: Number.NaN,
    })).toThrow(/relógio/i);
  });

  it("exige motivo enumerado e referência de chamado sem texto livre", () => {
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, reasonCode: "Bearer secret" as never,
    })).toThrow(/motivo/i);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, ticketReference: "cpf=000.000.000-00",
    })).toThrow(/chamado|referência/i);
    expect(() => prepareIntegrationLeaseRecoveryApproval({
      ...base, ticketReference: "",
    })).toThrow(/chamado|referência/i);
  });

  it("não vaza token, payload ou exceção do provider e nunca permite execução direta", () => {
    const result = prepareIntegrationLeaseRecoveryApproval(base);
    expect(result.executionAuthorized).toBe(false);
    for (const field of [
      "leaseToken", "leaseOwner", "payload", "payloadReference", "request",
      "authorization", "errorMessage", "stack", "secret",
    ]) expect(result).not.toHaveProperty(field);
  });
});
