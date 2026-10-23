import {
  assertIntegrationOutboxSnapshot,
  type IntegrationOutboxSnapshot,
} from "./integrationOutboxCas";

/**
 * Pure preflight only: actor, role assignments, permission codes and active
 * organization MUST come from trusted server-side reads. No public route,
 * database transaction, side effects, or recovery authorization is added here.
 * 
 * A preview is NOT permission to run a write. The server must recheck access,
 * lease state, version and audit inside a single transaction at commit time.
 */
export type IntegrationRecoveryReasonCode =
  | "delivery_outcome_unknown"
  | "lease_expired_after_disconnect"
  | "operator_reconciliation";

export type IntegrationRecoveryApprovalInput = {
  actor: {
    userId: number;
    active: boolean;
    assignments: readonly {
      roleCode: string;
      defaultScope: string;
      organizationId: number | null;
    }[];
    permissionCodes: readonly string[];
  };
  /** Must be resolved by the server, never selected by request payload. */
  resolvedOrganizationId: number;
  /** Loaded from the matching tenant-scoped storage, not provided by client. */
  delivery: IntegrationOutboxSnapshot;
  expectedVersion: number;
  /** Synchronized server clock; never supplied by browser or field device. */
  nowEpochMs: number;
  reasonCode: IntegrationRecoveryReasonCode;
  ticketReference: string;
};

export type IntegrationRecoveryApprovalPreview = Readonly<{
  decision: "eligible_for_audited_transaction";
  operation: "integration.outbox.expired_lease.quarantine";
  organizationId: number;
  deliveryId: number;
  expectedVersion: number;
  actorUserId: number;
  system: IntegrationOutboxSnapshot["system"];
  correlationId: string;
  reasonCode: IntegrationRecoveryReasonCode;
  ticketReference: string;
  evaluatedAtEpochMs: number;
  executionAuthorized: false;
  requiresTransactionalAudit: true;
}>;

const reasons = new Set<IntegrationRecoveryReasonCode>([
  "delivery_outcome_unknown",
  "lease_expired_after_disconnect",
  "operator_reconciliation",
]);

function assertPositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(label + " inválido.");
}

/** We intentionally do not inherit wildcard/legacy privileges for recovery. */
export function prepareIntegrationLeaseRecoveryApproval(
  input: IntegrationRecoveryApprovalInput,
): IntegrationRecoveryApprovalPreview {
  assertPositive(input.actor.userId, "Ator");
  assertPositive(input.resolvedOrganizationId, "Organização");
  assertPositive(input.expectedVersion, "Versão");
  if (!input.actor.active) throw new Error("Usuário inativo: recuperação bloqueada.");
  if (!Array.isArray(input.actor.assignments)
    || !input.actor.assignments.some(assignment =>
      assignment.roleCode === "administrador"
      && (assignment.defaultScope === "global"
        || (assignment.defaultScope === "organizacao"
          && assignment.organizationId === input.resolvedOrganizationId)),
    )) {
    throw new Error("Administrador sem escopo organizacional autorizado para recuperação.");
  }
  if (!Array.isArray(input.actor.permissionCodes)
    || !["workflow.execute", "integrations.recover"].every(permission =>
      input.actor.permissionCodes.includes(permission))) {
    throw new Error("Permissões dinâmicas explícitas insuficientes para recuperação.");
  }

  assertIntegrationOutboxSnapshot(input.delivery);
  if (input.delivery.organizationId !== input.resolvedOrganizationId) {
    throw new Error("Escopo da organização não corresponde à entrega.");
  }
  if (input.delivery.version !== input.expectedVersion) {
    throw new Error("Versão obsoleta da entrega: nova leitura obrigatória.");
  }
  if (!Number.isSafeInteger(input.nowEpochMs) || input.nowEpochMs < 0
    || input.nowEpochMs > 8_640_000_000_000_000) {
    throw new Error("Relógio do servidor inválido.");
  }
  if (input.delivery.status !== "leased") {
    throw new Error("Somente entrega leased/reservada pode ser enviada à quarentena.");
  }
  if (input.delivery.leaseExpiresAtMs === null
    || input.nowEpochMs < input.delivery.leaseExpiresAtMs) {
    throw new Error("Lease não expirado: recuperação prematura proibida.");
  }
  if (!reasons.has(input.reasonCode)) {
    throw new Error("Motivo de recuperação não homologado.");
  }
  if (typeof input.ticketReference !== "string"
    || !/^(?:INC|CHG|OPS)-[0-9]{3,12}$/.test(input.ticketReference)) {
    throw new Error("Referência de chamado inválida; informe INC-, CHG- ou OPS- numérico.");
  }
  if (!/^[A-Za-z0-9._:-]{3,160}$/.test(input.delivery.correlationId)) {
    throw new Error("Identificador de correlação inadequado para trilha de auditoria.");
  }

  // Intentionally exclude leaseToken, payloadReference, raw errors, secrets.
  return Object.freeze({
    decision: "eligible_for_audited_transaction",
    operation: "integration.outbox.expired_lease.quarantine",
    organizationId: input.resolvedOrganizationId,
    deliveryId: input.delivery.deliveryId,
    expectedVersion: input.delivery.version,
    actorUserId: input.actor.userId,
    system: input.delivery.system,
    correlationId: input.delivery.correlationId,
    reasonCode: input.reasonCode,
    ticketReference: input.ticketReference,
    evaluatedAtEpochMs: input.nowEpochMs,
    executionAuthorized: false,
    requiresTransactionalAudit: true,
  });
}
