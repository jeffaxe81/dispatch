import { and, count, desc, eq, exists, gt, inArray, isNull, like, or, type AnyColumn, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  accessPermissions, accessRoles, auditLogs, incidentAssignments, incidentEvidence, incidents,
  rolePermissions, teams, userRoleAssignments, vehicles,
} from "../drizzle/schema";
import { incidentTenantScopes, vehicleTenantScopes } from "../drizzle/tenantScopeSchema";
import { getAccessSnapshot } from "./accessControl";
import { isCanonicalGlobalScope } from "./accessPolicies";
import { getDb } from "./db";

/**
 * AXED-F091. Do NOT infer a log's tenant from its actor. A source resource
 * must map to exactly one tenant through a canonical relational association.
 */
export type TenantAuditScopeGrant = {
  defaultScope: "global" | "organizacao" | "unidade" | "departamento" | "grupo" | "equipe";
  organizationId: number | null;
  organizationalUnitId: number | null;
  teamId: number | null;
};

export type TenantAuditVisibility = {
  allTenant: boolean;
  teamIds: number[];
  unitIds: number[];
};

export function deriveTenantAuditVisibility(
  organizationId: number,
  grants: readonly TenantAuditScopeGrant[],
  legacyWithoutDynamicRoles: boolean,
): TenantAuditVisibility {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error("Tenant de auditoria inválido.");
  if (legacyWithoutDynamicRoles) return { allTenant: true, teamIds: [], unitIds: [] };
  let allTenant = false;
  const teamIds = new Set<number>();
  const unitIds = new Set<number>();
  for (const grant of grants) {
    if (grant.defaultScope === "global") {
      if (isCanonicalGlobalScope(grant)) allTenant = true;
    } else if (grant.organizationId === organizationId) {
      if (grant.defaultScope === "organizacao") allTenant = true;
      else if (grant.defaultScope === "equipe" && grant.teamId && Number.isSafeInteger(grant.teamId) && grant.teamId > 0)
        teamIds.add(grant.teamId);
      else if (["unidade", "departamento", "grupo"].includes(grant.defaultScope) &&
        grant.organizationalUnitId && Number.isSafeInteger(grant.organizationalUnitId) && grant.organizationalUnitId > 0)
        unitIds.add(grant.organizationalUnitId);
    }
  }
  return { allTenant, teamIds: [...teamIds], unitIds: [...unitIds] };
}

const safeMetadataKeys = new Set([
  "code", "status", "priority", "category", "assignedTeamId", "assignedVehicleId",
  "previousStatus", "nextStatus", "updatedAt",
]);

/** Deny nested objects, contact data, addresses, free-text notes and secrets. */
export function sanitizeTenantAuditSnapshot(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!safeMetadataKeys.has(key)) continue;
    if (typeof value === "string" && value.length <= 160) safe[key] = value;
    else if (typeof value === "number" && Number.isSafeInteger(value)) safe[key] = value;
    else if (value === null) safe[key] = null;
  }
  return Object.keys(safe).length ? safe : null;
}

function scopedTeamCondition(
  scope: TenantAuditVisibility,
  teamId: AnyColumn,
  organizationalUnitId: AnyColumn,
): SQL | undefined {
  if (scope.allTenant) return undefined;
  const rules: SQL[] = [];
  if (scope.teamIds.length) rules.push(inArray(teamId, scope.teamIds));
  if (scope.unitIds.length) rules.push(inArray(organizationalUnitId, scope.unitIds));
  // Empty scope is never interpreted as access to the entire tenant.
  return rules.length ? or(...rules)! : eq(teamId, -1);
}

/**
 * Load the same audit.view-scoped grants for both paginated audit logs and
 * the individual incident audit endpoint. A role carrying a different
 * permission must not accidentally authorize reading audit evidence.
 */
async function loadTenantAuditVisibility(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  actorUserId: number,
  organizationId: number,
): Promise<TenantAuditVisibility> {
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0 ||
      !Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Escopo de auditoria inválido." });
  }
  const snapshot = await getAccessSnapshot(actorUserId);
  const grantRows = snapshot.assignments.length === 0 ? [] :
    await db.select({
      defaultScope: accessRoles.defaultScope,
      organizationId: userRoleAssignments.organizationId,
      organizationalUnitId: userRoleAssignments.organizationalUnitId,
      teamId: userRoleAssignments.teamId,
    })
      .from(userRoleAssignments)
      .innerJoin(accessRoles, eq(userRoleAssignments.roleId, accessRoles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, accessRoles.id))
      .innerJoin(accessPermissions, eq(accessPermissions.id, rolePermissions.permissionId))
      .where(and(
        eq(userRoleAssignments.userId, actorUserId),
        eq(userRoleAssignments.active, true), eq(accessRoles.active, true),
        eq(accessPermissions.active, true),
        or(eq(accessPermissions.code, "audit.view"), eq(accessPermissions.code, "*")),
        or(isNull(userRoleAssignments.expiresAt), gt(userRoleAssignments.expiresAt, new Date())),
      ));
  // A revoked QA role is not a legacy-only identity. Fail closed when
  // all QA role assignments have expired or were disabled.
  const legacyOnly = snapshot.assignments.length === 0 && !snapshot.hasHistoricQaRole;
  return deriveTenantAuditVisibility(organizationId, grantRows, legacyOnly);
}

export function isTenantIncidentAuditVisible(input: {
  scope: TenantAuditVisibility;
  organizationId: number;
  assignedTeamId: number | null;
  team: { id: number; organizationId: number | null; organizationalUnitId: number | null } | null;
}): boolean {
  if (!Number.isSafeInteger(input.organizationId) || input.organizationId <= 0) return false;
  if (input.scope.allTenant) return true; // A tenant-wide auditor may inspect unassigned incidents.
  if (!Number.isSafeInteger(input.assignedTeamId) || (input.assignedTeamId ?? 0) <= 0 ||
      !input.team || input.team.id !== input.assignedTeamId ||
      input.team.organizationId !== input.organizationId) return false;
  return input.scope.teamIds.includes(input.team.id) ||
    (input.team.organizationalUnitId !== null &&
     input.scope.unitIds.includes(input.team.organizationalUnitId));
}

/**
 * The incident was already loaded through getIncidentForTenant, so its
 * tenant ownership is verified before entering this function. This guard
 * enforces the narrower audit grant and team/unit scope before any audit data
 * is fetched or serialized.
 */
export async function assertTenantIncidentAuditAccess(input: {
  actorUserId: number;
  organizationId: number;
  assignedTeamId: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Auditoria indisponível." });
  const scope = await loadTenantAuditVisibility(db, input.actorUserId, input.organizationId);
  if (scope.allTenant) return;
  if (!Number.isSafeInteger(input.assignedTeamId) || (input.assignedTeamId ?? 0) <= 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A auditoria da ocorrência está fora do escopo autorizado." });
  }
  const team = (await db.select({
    id: teams.id,
    organizationId: teams.organizationId,
    organizationalUnitId: teams.organizationalUnitId,
  }).from(teams).where(eq(teams.id, input.assignedTeamId!)).limit(1))[0] ?? null;
  if (!isTenantIncidentAuditVisible({ ...input, scope, team })) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A auditoria da ocorrência está fora do escopo autorizado." });
  }
}

/**
 * The UI needs the audit action and timestamp, not actor identity, free-text
 * request details or the before/after PII. The same allowlisted sanitizer is
 * used for the tenant-wide audit report.
 */
export function sanitizeIncidentAuditRows<T extends {
  audit: { actorUserId: number | null; beforeData: unknown; afterData: unknown };
  actorName: string | null;
}>(rows: readonly T[]): T[] {
  return rows.map(({audit, actorName, ...rest}) => ({
    ...rest,
    audit: {
      ...audit,
      actorUserId: null,
      beforeData: sanitizeTenantAuditSnapshot(audit.beforeData),
      afterData: sanitizeTenantAuditSnapshot(audit.afterData),
    },
    actorName: actorName ? "Usuário auditado" : null,
  } as T));
}

/**
 * Always map audit logs to current canonical ownership before filtering,
 * counting and paginating. Orphaned/deleted resources are hidden fail-closed.
 * Supported canonical resources: incident, assignment, incident_evidence, team, vehicle.
 * Every other resource type is deliberately invisible until a safe mapping exists.
 */
export async function listTenantOperationLogs(input: {
  actorUserId: number;
  organizationId: number;
  page: number;
  pageSize: number;
  resourceType?: string;
  search?: string;
}) {
  if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) ||
      input.pageSize < 1 || input.pageSize > 100) throw new Error("Paginação de auditoria inválida.");

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para a auditoria.");

  const scope = await loadTenantAuditVisibility(db, input.actorUserId, input.organizationId);

  const incidentAllowed = exists(db.select({ id: incidentTenantScopes.incidentId })
    .from(incidentTenantScopes)
    .innerJoin(incidents, eq(incidents.id, incidentTenantScopes.incidentId))
    .leftJoin(teams, eq(teams.id, incidents.assignedTeamId))
    .where(and(
      eq(incidentTenantScopes.incidentId, auditLogs.resourceId),
      eq(incidentTenantScopes.organizationId, input.organizationId),
      scope.allTenant ? undefined : eq(teams.organizationId, input.organizationId),
      scopedTeamCondition(scope, incidents.assignedTeamId, teams.organizationalUnitId),
    )));

  const assignmentAllowed = exists(db.select({ id: incidentAssignments.id })
    .from(incidentAssignments)
    .innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidentAssignments.incidentId))
    .innerJoin(teams, eq(teams.id, incidentAssignments.teamId))
    .where(and(
      eq(incidentAssignments.id, auditLogs.resourceId),
      eq(incidentTenantScopes.organizationId, input.organizationId),
      eq(teams.organizationId, input.organizationId),
      scopedTeamCondition(scope, incidentAssignments.teamId, teams.organizationalUnitId),
    )));

  const evidenceAllowed = exists(db.select({ id: incidentEvidence.id })
    .from(incidentEvidence)
    .innerJoin(incidentTenantScopes, eq(incidentTenantScopes.incidentId, incidentEvidence.incidentId))
    .innerJoin(incidents, eq(incidents.id, incidentEvidence.incidentId))
    .leftJoin(teams, eq(teams.id, incidents.assignedTeamId))
    .where(and(
      eq(incidentEvidence.id, auditLogs.resourceId),
      eq(incidentTenantScopes.organizationId, input.organizationId),
      scope.allTenant ? undefined : eq(teams.organizationId, input.organizationId),
      scopedTeamCondition(scope, incidents.assignedTeamId, teams.organizationalUnitId),
    )));

  const teamAllowed = exists(db.select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, auditLogs.resourceId),
      eq(teams.organizationId, input.organizationId),
      scopedTeamCondition(scope, teams.id, teams.organizationalUnitId))));

  const vehicleAllowed = exists(db.select({ id: vehicles.id })
    .from(vehicles)
    .innerJoin(vehicleTenantScopes, eq(vehicleTenantScopes.vehicleId, vehicles.id))
    .leftJoin(teams, eq(teams.id, vehicles.teamId))
    .where(and(eq(vehicles.id, auditLogs.resourceId),
      eq(vehicleTenantScopes.organizationId, input.organizationId),
      scope.allTenant ? undefined : eq(teams.organizationId, input.organizationId),
      scopedTeamCondition(scope, vehicles.teamId, teams.organizationalUnitId))));

  const resourceOwned = or(
    and(eq(auditLogs.resourceType, "incident"), incidentAllowed),
    and(eq(auditLogs.resourceType, "assignment"), assignmentAllowed),
    and(eq(auditLogs.resourceType, "incident_evidence"), evidenceAllowed),
    and(eq(auditLogs.resourceType, "team"), teamAllowed),
    and(eq(auditLogs.resourceType, "vehicle"), vehicleAllowed),
  )!;

  const search = input.search?.trim();
  const where = and(
    resourceOwned,
    input.resourceType ? eq(auditLogs.resourceType, input.resourceType) : undefined,
    search ? or(
      like(auditLogs.action, "%" + search + "%"),
      like(auditLogs.resourceType, "%" + search + "%"),
    ) : undefined,
  );
  // The same SQL predicate is applied to rows and COUNT. Never filter after LIMIT.
  const [rows, counts] = await Promise.all([
    db.select({ audit: auditLogs }).from(auditLogs).where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);

  return {
    rows: rows.map(({ audit }) => ({
      audit: {
        ...audit,
        actorUserId: null, // Do not expose global actor identities across organizational boundaries.
        beforeData: sanitizeTenantAuditSnapshot(audit.beforeData),
        afterData: sanitizeTenantAuditSnapshot(audit.afterData),
      },
      actorName: audit.actorUserId ? "Usuário auditado" : null,
      actorEmail: null,
    })),
    total: Number(counts[0]?.total ?? 0),
  };
}
