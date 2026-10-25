import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import {
  accessPermissions, accessRoles, auditLogs, rolePermissions, users,
  userRoleAssignments,
} from "../drizzle/schema";
import { integrationDeliveryOutbox } from "../drizzle/integrationDeliverySchema";
import type { getDb } from "./dbLegacy";
import { hydrateIntegrationOutbox } from "./integrationOutboxCas";
import { buildExpiredIntegrationLeaseQuarantine } from "./integrationOutboxExpiredLease";
import {
  prepareIntegrationLeaseRecoveryApproval,
  type IntegrationRecoveryReasonCode,
} from "./integrationOutboxRecoveryApproval";

type IntegrationDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;
export type IntegrationRecoveryRequest = {
  /** Must come from an authenticated server session, never request JSON. */
  authenticatedActorUserId: number;
  /** Server-resolved active tenant. */
  resolvedOrganizationId: number;
  deliveryId: number;
  expectedVersion: number;
  reasonCode: IntegrationRecoveryReasonCode;
  ticketReference: string;
  /** Human confirmation verified by the protected caller, not a public input. */
  operatorApproved: true;
};
export type IntegrationRecoveryResult = {
  outcome: "quarantined";
  organizationId: number;
  deliveryId: number;
  version: number;
  auditAction: "integration.outbox.expired_lease.quarantine";
};

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(label + " inválido.");
  }
}

/** Double gate. No scheduler, endpoint or production runtime is wired. */
function assertJ20HomologationGate(): void {
  if (process.env.NODE_ENV !== "test"
    || process.env.AXE_RUNTIME_ENV !== "homologation"
    || process.env.AXE_INTEGRATION_RECOVERY_J20_ENABLED !== "true") {
    throw new Error("J20 recuperação/auditoria desabilitada fora de homologação isolada.");
  }
}

export class IntegrationRecoveryConflictError extends Error {
  constructor() {
    super("Conflito CAS na recuperação: estado alterado por outra transação.");
    this.name = "IntegrationRecoveryConflictError";
  }
}

/**
 * J20: one MySQL transaction owns RBAC re-evaluation, locked delivery,
 * fenced UPDATE and sanitized audit insert. Any error rolls everything back.
 *
 * This is an internal opt-in factory, intentionally not imported by any route.
 * The caller must authenticate the actor and resolve the active organization
 * from trusted session state, never accept those IDs from untrusted input.
 */
export function createIntegrationRecoveryAuditedMySqlService(
  db: IntegrationDb,
  clock: () => number = Date.now,
) {
  return {
    async quarantineExpired(input: IntegrationRecoveryRequest): Promise<IntegrationRecoveryResult> {
      assertJ20HomologationGate();
      if (input.operatorApproved !== true) {
        throw new Error("Confirmação humana da operação J20 é obrigatória.");
      }
      positive(input.authenticatedActorUserId, "Ator");
      positive(input.resolvedOrganizationId, "Organização");
      positive(input.deliveryId, "Entrega");
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
        throw new Error("Versão CAS inválida.");
      }

      return db.transaction(async tx => {
        assertJ20HomologationGate();

        // Lock actor before consulting assignments, so inactive users fail closed.
        const actor = (await tx.select({ id: users.id, active: users.active })
          .from(users)
          .where(eq(users.id, input.authenticatedActorUserId))
          .limit(1).for("update"))[0];
        if (!actor || !actor.active) throw new Error("Ator inativo ou não encontrado.");

        // Read active scoped assignments and their explicit permissions within
        // the SAME transaction as the outbox recovery.
        const assignments = await tx.select({
          id: userRoleAssignments.id,
          roleId: accessRoles.id,
          roleCode: accessRoles.code,
          defaultScope: accessRoles.defaultScope,
          organizationId: userRoleAssignments.organizationId,
        }).from(userRoleAssignments)
          .innerJoin(accessRoles, eq(userRoleAssignments.roleId, accessRoles.id))
          .where(and(
            eq(userRoleAssignments.userId, actor.id),
            eq(userRoleAssignments.active, true),
            eq(accessRoles.active, true),
            or(isNull(userRoleAssignments.expiresAt),
              gt(userRoleAssignments.expiresAt, new Date())),
          )).for("update");

        const scoped = assignments.filter(a =>
          a.defaultScope === "global" ||
          (a.defaultScope === "organizacao"
            && a.organizationId === input.resolvedOrganizationId),
        );
        const ids = scoped.map(a => a.roleId);
        const permissions = ids.length === 0 ? [] :
          await tx.select({
            roleId: rolePermissions.roleId,
            code: accessPermissions.code,
          }).from(rolePermissions)
            .innerJoin(accessPermissions, eq(rolePermissions.permissionId, accessPermissions.id))
            .where(and(eq(accessPermissions.active, true),
              // Separate query per allowed role is avoided with an explicit
              // OR over database-derived IDs, never provided by the caller.
              or(...ids.map(id => eq(rolePermissions.roleId, id))),
            )).for("update");

        const row = (await tx.select().from(integrationDeliveryOutbox)
          .where(and(
            eq(integrationDeliveryOutbox.id, input.deliveryId),
            eq(integrationDeliveryOutbox.organizationId, input.resolvedOrganizationId),
          )).limit(1).for("update"))[0];
        if (!row) throw new Error("Entrega não encontrada no escopo autorizado.");

        const current = hydrateIntegrationOutbox(row);
        // Clock is evaluated AFTER locks, not before waiting on DB contention.
        const nowEpochMs = clock();
        const preview = prepareIntegrationLeaseRecoveryApproval({
          actor: {
            userId: actor.id,
            active: actor.active,
            assignments: scoped.map(a => ({
              roleCode: a.roleCode,
              defaultScope: a.defaultScope,
              organizationId: a.organizationId,
            })),
            permissionCodes: permissions.map(p => p.code),
          },
          resolvedOrganizationId: input.resolvedOrganizationId,
          delivery: current,
          expectedVersion: input.expectedVersion,
          nowEpochMs,
          reasonCode: input.reasonCode,
          ticketReference: input.ticketReference,
        });
        const next = buildExpiredIntegrationLeaseQuarantine(current, nowEpochMs);
        assertJ20HomologationGate();

        const [result] = await tx.update(integrationDeliveryOutbox).set({
          status: "dead_letter",
          deliveryVersion: next.version,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAtMs: null,
          nextAttemptAtMs: null,
          deliveredAtMs: null,
          deadLetteredAtMs: next.deadLetteredAtMs,
          lastFailureKind: "unknown",
        }).where(and(
          eq(integrationDeliveryOutbox.id, current.deliveryId),
          eq(integrationDeliveryOutbox.organizationId, current.organizationId),
          eq(integrationDeliveryOutbox.deliveryVersion, current.version),
          eq(integrationDeliveryOutbox.status, "leased"),
          eq(integrationDeliveryOutbox.leaseOwner, current.leaseOwner!),
          eq(integrationDeliveryOutbox.leaseToken, current.leaseToken!),
          eq(integrationDeliveryOutbox.leaseExpiresAtMs, current.leaseExpiresAtMs!),
          lte(integrationDeliveryOutbox.leaseExpiresAtMs, nowEpochMs),
          eq(integrationDeliveryOutbox.system, current.system),
          eq(integrationDeliveryOutbox.idempotencyKey, current.idempotencyKey),
          eq(integrationDeliveryOutbox.correlationId, current.correlationId),
        ));
        if (result.affectedRows !== 1) throw new IntegrationRecoveryConflictError();

        // This audit row is part of the SAME transaction. A failure rolls back
        // the state change. No lease token, payload reference, auth or PII.
        await tx.insert(auditLogs).values({
          resourceType: "integration_delivery_outbox",
          resourceId: current.deliveryId,
          action: preview.operation,
          actorUserId: actor.id,
          beforeData: {
            organizationId: current.organizationId,
            system: current.system,
            correlationId: current.correlationId,
            status: current.status,
            deliveryVersion: current.version,
            attempts: current.attempts,
          },
          afterData: {
            organizationId: current.organizationId,
            system: current.system,
            correlationId: current.correlationId,
            status: next.status,
            deliveryVersion: next.version,
            reasonCode: preview.reasonCode,
            ticketReference: preview.ticketReference,
            evaluatedAtEpochMs: nowEpochMs,
            remoteOutcome: "unknown",
          },
        });
        // Second feature-gate check guarantees a disabled policy rolls back.
        assertJ20HomologationGate();
        return {
          outcome: "quarantined",
          organizationId: current.organizationId,
          deliveryId: current.deliveryId,
          version: next.version,
          auditAction: preview.operation,
        };
      });
    },
  };
}
