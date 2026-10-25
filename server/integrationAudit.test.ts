import { describe, expect, it } from "vitest";
import { createIntegrationAuditRecord } from "../shared/integrationAudit";

describe("D-012J J14 — auditoria sanitizada de integrações", () => {
  it("registra chamada bem-sucedida com tenant, ator, sistema e correlação", () => {
    const record = createIntegrationAuditRecord({
      tenantId: 7,
      actorUserId: 42,
      system: "crm",
      operation: "contact.sync",
      correlationId: "corr-42",
      outcome: "success",
      errorKind: null,
      occurredAt: new Date("2026-10-22T23:00:00.000Z"),
    });

    expect(record).toEqual({
      tenantId: 7,
      actorUserId: 42,
      system: "crm",
      operation: "contact.sync",
      correlationId: "corr-42",
      outcome: "success",
      errorKind: null,
      occurredAt: new Date("2026-10-22T23:00:00.000Z"),
    });
  });

  it("registra indisponibilidade externa por categoria segura, sem erro bruto", () => {
    const record = createIntegrationAuditRecord({
      tenantId: 7,
      actorUserId: 42,
      system: "neo",
      operation: "interaction.push",
      correlationId: "corr-9",
      outcome: "degraded",
      errorKind: "unavailable",
      occurredAt: new Date("2026-10-22T23:00:00.000Z"),
      error: new Error("Authorization: Bearer secret-token") as never,
      payload: { cpf: "00000000000" } as never,
      token: "secret-token" as never,
      authorization: "Bearer secret-token" as never,
    } as never);

    expect(record.errorKind).toBe("unavailable");
    expect(record).not.toHaveProperty("error");
    expect(record).not.toHaveProperty("errorMessage");
    expect(record).not.toHaveProperty("stack");
    expect(record).not.toHaveProperty("payload");
    expect(record).not.toHaveProperty("token");
    expect(record).not.toHaveProperty("authorization");
  });

  it("aceita somente categorias sanitizadas de erro", () => {
    expect(() => createIntegrationAuditRecord({
      tenantId: 7,
      actorUserId: 42,
      system: "inventory",
      operation: "asset.lookup",
      correlationId: "corr-7",
      outcome: "failed",
      errorKind: "Bearer secret-token" as never,
      occurredAt: new Date("2026-10-22T23:00:00.000Z"),
    })).toThrow(/erro|categoria/i);
  });

  it("não aceita erro em resultado success nem falha sem categoria", () => {
    expect(() => createIntegrationAuditRecord({
      tenantId: 7,
      actorUserId: 42,
      system: "crm",
      operation: "contact.sync",
      correlationId: "corr-1",
      outcome: "success",
      errorKind: "timeout",
      occurredAt: new Date("2026-10-22T23:00:00.000Z"),
    })).toThrow(/success|erro/i);

    expect(() => createIntegrationAuditRecord({
      tenantId: 7,
      actorUserId: 42,
      system: "crm",
      operation: "contact.sync",
      correlationId: "corr-2",
      outcome: "failed",
      errorKind: null,
      occurredAt: new Date("2026-10-22T23:00:00.000Z"),
    })).toThrow(/categoria|erro/i);
  });

  it("falha fechado para tenant, ator, operação, correlação ou relógio inválidos", () => {
    const base = {
      tenantId: 7,
      actorUserId: 42,
      system: "crm" as const,
      operation: "contact.sync",
      correlationId: "corr-1",
      outcome: "success" as const,
      errorKind: null,
      occurredAt: new Date("2026-10-22T23:00:00.000Z"),
    };

    expect(() => createIntegrationAuditRecord({ ...base, tenantId: 0 })).toThrow(/tenant/i);
    expect(() => createIntegrationAuditRecord({ ...base, actorUserId: 0 })).toThrow(/ator|usuário/i);
    expect(() => createIntegrationAuditRecord({ ...base, operation: "   " })).toThrow(/operação/i);
    expect(() => createIntegrationAuditRecord({ ...base, correlationId: "" })).toThrow(/correlation/i);
    expect(() => createIntegrationAuditRecord({ ...base, occurredAt: new Date("invalid") })).toThrow(/data|relógio/i);
  });
});
