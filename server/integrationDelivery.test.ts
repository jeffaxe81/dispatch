import { describe, expect, it } from "vitest";
import {
  buildIntegrationIdempotencyKey,
  createIntegrationReceipt,
  isSameIntegrationDelivery,
} from "../shared/integrationDelivery";

describe("D-012J J10 — idempotência e receipts de integração", () => {
  it("gera chave idempotente determinística com isolamento por tenant e sistema", () => {
    const base = { tenantId: 7, system: "crm" as const, eventType: "contact.updated", messageId: "msg-42" };
    const first = buildIntegrationIdempotencyKey(base);
    expect(buildIntegrationIdempotencyKey(base)).toBe(first);
    expect(buildIntegrationIdempotencyKey({ ...base, tenantId: 8 })).not.toBe(first);
    expect(buildIntegrationIdempotencyKey({ ...base, system: "neo" })).not.toBe(first);
  });

  it("não considera mensagens de tenants diferentes como a mesma entrega", () => {
    expect(isSameIntegrationDelivery(
      { tenantId: 7, system: "neo", idempotencyKey: "k1" },
      { tenantId: 7, system: "neo", idempotencyKey: "k1" },
    )).toBe(true);
    expect(isSameIntegrationDelivery(
      { tenantId: 7, system: "neo", idempotencyKey: "k1" },
      { tenantId: 8, system: "neo", idempotencyKey: "k1" },
    )).toBe(false);
  });

  it("cria receipt mínimo sem payload nem credencial", () => {
    const receipt = createIntegrationReceipt({
      tenantId: 7,
      system: "inventory",
      contractVersion: 1,
      messageId: "msg-7",
      idempotencyKey: "key-7",
      correlationId: "corr-7",
      status: "accepted",
      receivedAt: new Date("2026-10-22T21:00:00.000Z"),
    });

    expect(receipt).toEqual({
      tenantId: 7,
      system: "inventory",
      contractVersion: 1,
      messageId: "msg-7",
      idempotencyKey: "key-7",
      correlationId: "corr-7",
      status: "accepted",
      receivedAt: new Date("2026-10-22T21:00:00.000Z"),
    });
    expect(receipt).not.toHaveProperty("payload");
    expect(receipt).not.toHaveProperty("token");
    expect(receipt).not.toHaveProperty("authorization");
  });

  it("falha fechado para tenant, identificadores ou status inválidos", () => {
    expect(() => buildIntegrationIdempotencyKey({ tenantId: 0, system: "crm", eventType: "x", messageId: "m" })).toThrow(/tenant/i);
    expect(() => buildIntegrationIdempotencyKey({ tenantId: 7, system: "crm", eventType: "", messageId: "m" })).toThrow(/evento/i);
    expect(() => createIntegrationReceipt({
      tenantId: 7,
      system: "crm",
      contractVersion: 1,
      messageId: "",
      idempotencyKey: "k",
      correlationId: "c",
      status: "accepted",
      receivedAt: new Date(),
    })).toThrow(/message|mensagem/i);
  });
});
