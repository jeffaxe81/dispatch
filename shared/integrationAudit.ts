import type { IntegrationSystem } from "./integrationContracts";

export type IntegrationAuditOutcome =
  | "success"
  | "degraded"
  | "rejected"
  | "failed";

export type IntegrationAuditErrorKind =
  | "timeout"
  | "unavailable"
  | "rate_limited"
  | "contract_mismatch"
  | "authorization"
  | "unknown";

export type IntegrationAuditRecord = {
  tenantId: number;
  actorUserId: number;
  system: IntegrationSystem;
  operation: string;
  correlationId: string;
  outcome: IntegrationAuditOutcome;
  errorKind: IntegrationAuditErrorKind | null;
  occurredAt: Date;
};

const systems = new Set<IntegrationSystem>(["neo", "inventory", "crm"]);
const outcomes = new Set<IntegrationAuditOutcome>([
  "success",
  "degraded",
  "rejected",
  "failed",
]);
const errorKinds = new Set<IntegrationAuditErrorKind>([
  "timeout",
  "unavailable",
  "rate_limited",
  "contract_mismatch",
  "authorization",
  "unknown",
]);

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} inválido.`);
  }
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} é obrigatório.`);
  return normalized;
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Data/relógio da auditoria inválido.");
  }
}

export function createIntegrationAuditRecord(input: {
  tenantId: number;
  actorUserId: number;
  system: IntegrationSystem;
  operation: string;
  correlationId: string;
  outcome: IntegrationAuditOutcome;
  errorKind: IntegrationAuditErrorKind | null;
  occurredAt: Date;
}): IntegrationAuditRecord {
  assertPositiveInteger(input.tenantId, "Tenant");
  assertPositiveInteger(input.actorUserId, "Ator/usuário");

  if (!systems.has(input.system)) {
    throw new Error("Sistema de integração inválido.");
  }
  if (!outcomes.has(input.outcome)) {
    throw new Error("Resultado de auditoria inválido.");
  }

  const operation = requiredText(input.operation, "Operação");
  const correlationId = requiredText(input.correlationId, "Correlation ID");
  assertValidDate(input.occurredAt);

  if (input.errorKind !== null && !errorKinds.has(input.errorKind)) {
    throw new Error("Categoria de erro inválida.");
  }
  if (input.outcome === "success" && input.errorKind !== null) {
    throw new Error("Resultado success não pode conter categoria de erro.");
  }
  if (input.outcome !== "success" && input.errorKind === null) {
    throw new Error("Categoria de erro é obrigatória para resultado não-success.");
  }

  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    system: input.system,
    operation,
    correlationId,
    outcome: input.outcome,
    errorKind: input.errorKind,
    occurredAt: input.occurredAt,
  };
}
