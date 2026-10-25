import type { IntegrationSystem } from "./integrationContracts";

export type IntegrationReceiptStatus = "accepted" | "duplicate" | "rejected";

export type IntegrationDeliveryIdentity = {
  tenantId: number;
  system: IntegrationSystem;
  idempotencyKey: string;
};

export type IntegrationReceipt = {
  tenantId: number;
  system: IntegrationSystem;
  contractVersion: 1;
  messageId: string;
  idempotencyKey: string;
  correlationId: string;
  status: IntegrationReceiptStatus;
  receivedAt: Date;
};

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} é obrigatório.`);
  return normalized;
}

function assertTenantId(tenantId: number): void {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("Tenant inválido para integração.");
  }
}

export function buildIntegrationIdempotencyKey(input: {
  tenantId: number;
  system: IntegrationSystem;
  eventType: string;
  messageId: string;
}): string {
  assertTenantId(input.tenantId);
  const eventType = requiredText(input.eventType, "Tipo de evento");
  const messageId = requiredText(input.messageId, "Message ID");
  return ["v1", input.tenantId, input.system, eventType, messageId]
    .map(value => encodeURIComponent(String(value)))
    .join(":");
}

export function isSameIntegrationDelivery(
  left: IntegrationDeliveryIdentity,
  right: IntegrationDeliveryIdentity,
): boolean {
  return left.tenantId === right.tenantId
    && left.system === right.system
    && left.idempotencyKey === right.idempotencyKey;
}

export function createIntegrationReceipt(input: IntegrationReceipt): IntegrationReceipt {
  assertTenantId(input.tenantId);
  if (input.contractVersion !== 1) {
    throw new Error("Versão de contrato incompatível para receipt.");
  }

  const messageId = requiredText(input.messageId, "Message ID");
  const idempotencyKey = requiredText(input.idempotencyKey, "Chave de idempotência");
  const correlationId = requiredText(input.correlationId, "Correlation ID");

  if (!["accepted", "duplicate", "rejected"].includes(input.status)) {
    throw new Error("Status de receipt inválido.");
  }
  if (!(input.receivedAt instanceof Date) || Number.isNaN(input.receivedAt.getTime())) {
    throw new Error("Data de recebimento inválida.");
  }

  return {
    tenantId: input.tenantId,
    system: input.system,
    contractVersion: 1,
    messageId,
    idempotencyKey,
    correlationId,
    status: input.status,
    receivedAt: input.receivedAt,
  };
}
