import { describe, expect, it } from "vitest";
import { runIntegrationConformanceCheck } from "../shared/integrationConformance";

describe("D-012J J11 — harness de conformidade de integrações", () => {
  it("valida contrato v1 e modo permitido sem executar chamada externa", () => {
    const result = runIntegrationConformanceCheck({
      tenantId: 7,
      system: "crm",
      contractVersion: 1,
      mode: "event",
      idempotencyKey: "v1:7:crm:contact.updated:msg-42",
      externalAvailable: true,
    });

    expect(result).toEqual({
      tenantId: 7,
      system: "crm",
      contractVersion: 1,
      mode: "event",
      status: "conformant",
      coreDisposition: "continue",
      externalAvailable: true,
    });
  });

  it("mantém o núcleo disponível quando terceiro está indisponível", () => {
    const result = runIntegrationConformanceCheck({
      tenantId: 7,
      system: "neo",
      contractVersion: 1,
      mode: "api",
      idempotencyKey: "v1:7:neo:interaction.updated:msg-9",
      externalAvailable: false,
    });

    expect(result.status).toBe("degraded");
    expect(result.coreDisposition).toBe("continue");
    expect(result.externalAvailable).toBe(false);
  });

  it("não propaga payload, token, autorização ou erro bruto no resultado", () => {
    const result = runIntegrationConformanceCheck({
      tenantId: 7,
      system: "inventory",
      contractVersion: 1,
      mode: "event",
      idempotencyKey: "key-7",
      externalAvailable: false,
    });

    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("authorization");
    expect(result).not.toHaveProperty("error");
    expect(result).not.toHaveProperty("errorMessage");
  });

  it("falha fechado para tenant, versão, modo ou chave idempotente inválidos", () => {
    expect(() => runIntegrationConformanceCheck({
      tenantId: 0,
      system: "crm",
      contractVersion: 1,
      mode: "api",
      idempotencyKey: "k",
      externalAvailable: true,
    })).toThrow(/tenant/i);

    expect(() => runIntegrationConformanceCheck({
      tenantId: 7,
      system: "crm",
      contractVersion: 2,
      mode: "api",
      idempotencyKey: "k",
      externalAvailable: true,
    })).toThrow(/versão|contrato/i);

    expect(() => runIntegrationConformanceCheck({
      tenantId: 7,
      system: "crm",
      contractVersion: 1,
      mode: "direct_database" as never,
      idempotencyKey: "k",
      externalAvailable: true,
    })).toThrow(/modo/i);

    expect(() => runIntegrationConformanceCheck({
      tenantId: 7,
      system: "crm",
      contractVersion: 1,
      mode: "api",
      idempotencyKey: "   ",
      externalAvailable: true,
    })).toThrow(/idempot/i);
  });
});
