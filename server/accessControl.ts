import { and, eq, gt, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { accessPermissions, accessRoles, rolePermissions, teams, userRoleAssignments, type User } from "../drizzle/schema";
import type { OperationalRole } from "../shared/operations";
import { getDb } from "./db";
import { ENV } from "./_core/env";

export type PermissionCode = string;
type CurrentUser = Pick<User, "id" | "openId" | "operationalRole" | "teamId" | "active">;

const legacyPermissions: Record<OperationalRole, Set<PermissionCode>> = {
  administrador: new Set(["*"]),
  supervisor: new Set(["occurrences.view", "occurrences.assign", "occurrences.change_priority", "occurrences.close", "dispatch.view", "dispatch.reassign", "agents.view", "agents.track", "teams.view", "vehicles.view", "reports.view"]),
  despachador: new Set(["occurrences.view", "occurrences.assign", "occurrences.change_priority", "dispatch.view", "dispatch.create", "dispatch.reassign", "dispatch.cancel", "agents.view", "agents.track", "teams.view", "vehicles.view", "reports.view", "reports.export"]),
  operador: new Set(["occurrences.view", "occurrences.create", "occurrences.edit", "dispatch.view"]),
  agente: new Set(["occurrences.view", "occurrences.transition", "occurrences.close", "dispatch.view", "teams.view", "vehicles.view"]),
};

export type AccessAssignment = {
  roleCode: string;
  defaultScope: "global" | "organizacao" | "unidade" | "departamento" | "grupo" | "equipe";
  organizationId: number | null;
  organizationalUnitId: number | null;
  teamId: number | null;
};

export function hasSuperAdministratorAssignment(assignments: AccessAssignment[]) {
  return assignments.some(assignment => assignment.roleCode === "super_administrador");
}

export function hasAdministratorAssignment(assignments: AccessAssignment[]) {
  return assignments.some(assignment => assignment.roleCode === "administrador");
}

export function evaluatePermission(input: { active: boolean; operationalRole: OperationalRole; hasDynamicAssignments: boolean; dynamicPermissions: Iterable<PermissionCode> }, permission: PermissionCode) {
  if (!input.active) return false;
  const dynamicPermissions = new Set(input.dynamicPermissions);
  if (input.hasDynamicAssignments) return dynamicPermissions.has(permission);
  const legacy = legacyPermissions[input.operationalRole];
  return legacy?.has("*") || legacy?.has(permission) || false;
}

export function resolveEffectivePermissions(input: { active: boolean; operationalRole: OperationalRole; hasDynamicAssignments: boolean; dynamicPermissions: Iterable<PermissionCode> }, catalog: Iterable<PermissionCode>) {
  const catalogCodes = Array.from(catalog);
  if (catalogCodes.length > 0) return catalogCodes.filter(code => evaluatePermission(input, code));
  if (input.hasDynamicAssignments) return Array.from(new Set(input.dynamicPermissions));
  return Array.from(legacyPermissions[input.operationalRole] ?? []);
}

export function evaluateTeamScope(assignments: AccessAssignment[], team: { organizationId: number | null; organizationalUnitId: number | null; id: number }) {
  return assignments.some(assignment => {
    if (assignment.defaultScope === "global") return true;
    if (assignment.teamId === team.id) return true;
    if (assignment.defaultScope === "organizacao") return assignment.organizationId !== null && assignment.organizationId === team.organizationId;
    if (["unidade", "departamento", "grupo"].includes(assignment.defaultScope)) {
      return assignment.organizationId === team.organizationId && assignment.organizationalUnitId !== null && assignment.organizationalUnitId === team.organizationalUnitId;
    }
    return false;
  });
}

export function requiresExplicitTeamSelection(assignments: AccessAssignment[]) {
  return assignments.length > 0 && !assignments.some(assignment => assignment.defaultScope === "global");
}

export async function getAccessSnapshot(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const validAssignment = and(
    eq(userRoleAssignments.userId, userId),
    eq(userRoleAssignments.active, true),
    eq(accessRoles.active, true),
    or(isNull(userRoleAssignments.expiresAt), gt(userRoleAssignments.expiresAt, new Date())),
  );
  const [assignments, permissions] = await Promise.all([
    db.select({
      roleCode: accessRoles.code,
      defaultScope: accessRoles.defaultScope,
      organizationId: userRoleAssignments.organizationId,
      organizationalUnitId: userRoleAssignments.organizationalUnitId,
      teamId: userRoleAssignments.teamId,
    }).from(userRoleAssignments).innerJoin(accessRoles, eq(userRoleAssignments.roleId, accessRoles.id)).where(validAssignment),
    db.select({ code: accessPermissions.code }).from(userRoleAssignments)
      .innerJoin(accessRoles, eq(userRoleAssignments.roleId, accessRoles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, accessRoles.id))
      .innerJoin(accessPermissions, eq(rolePermissions.permissionId, accessPermissions.id))
      .where(and(validAssignment, eq(accessPermissions.active, true))),
  ]);
  return { assignments: assignments as AccessAssignment[], permissions: new Set(permissions.map(row => row.code)) };
}

export async function hasPermission(user: CurrentUser, permission: PermissionCode) {
  const snapshot = await getAccessSnapshot(user.id);
  return evaluatePermission({ active: user.active, operationalRole: user.operationalRole, hasDynamicAssignments: snapshot.assignments.length > 0, dynamicPermissions: snapshot.permissions }, permission);
}

export async function getEffectiveAccess(user: CurrentUser) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [snapshot, catalog] = await Promise.all([getAccessSnapshot(user.id), db.select({ code: accessPermissions.code }).from(accessPermissions).where(eq(accessPermissions.active, true))]);
  const input = { active: user.active, operationalRole: user.operationalRole, hasDynamicAssignments: snapshot.assignments.length > 0, dynamicPermissions: snapshot.permissions };
  const permissions = resolveEffectivePermissions(input, catalog.map(row => row.code));
  return { permissions, assignments: snapshot.assignments, usesDynamicRoles: snapshot.assignments.length > 0, isSuperAdministrator: user.openId === ENV.ownerOpenId || hasSuperAdministratorAssignment(snapshot.assignments) };
}

export async function assertPermission(user: CurrentUser, permission: PermissionCode) {
  if (!user.active) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
  if (!(await hasPermission(user, permission))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Permissão insuficiente para esta operação." });
  }
}

export async function assertTeamScope(user: CurrentUser, teamId: number, permission: PermissionCode) {
  await assertPermission(user, permission);
  const snapshot = await getAccessSnapshot(user.id);
  if (snapshot.assignments.length === 0) {
    if (user.operationalRole === "agente" && user.teamId !== teamId) throw new TRPCError({ code: "FORBIDDEN", message: "Ação permitida apenas no escopo da equipe vinculada." });
    return;
  }
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const team = (await db.select({ id: teams.id, organizationId: teams.organizationId, organizationalUnitId: teams.organizationalUnitId }).from(teams).where(eq(teams.id, teamId)).limit(1))[0];
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Equipe não encontrada." });
  if (evaluateTeamScope(snapshot.assignments, team)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "O papel não possui escopo para a equipe selecionada." });
}

/**
 * Convert an optional team filter into a safe filter for reports/exports.
 * Dynamically scoped users must select one authorized team; otherwise an
 * omitted filter would silently widen the query to every organization.
 */
export async function resolveAuthorizedTeamFilter(user: CurrentUser, requestedTeamId: number | undefined, permission: PermissionCode) {
  await assertPermission(user, permission);
  if (user.operationalRole === "agente") {
    if (!user.teamId) throw new TRPCError({ code: "FORBIDDEN", message: "Agente sem equipe vinculada." });
    await assertTeamScope(user, user.teamId, permission);
    return user.teamId;
  }
  if (requestedTeamId !== undefined) {
    await assertTeamScope(user, requestedTeamId, permission);
    return requestedTeamId;
  }
  const snapshot = await getAccessSnapshot(user.id);
  if (requiresExplicitTeamSelection(snapshot.assignments)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma equipe dentro do seu escopo para consultar ou exportar o relatório." });
  }
  return undefined;
}

export async function assertAdminAccess(user: CurrentUser) {
  const canManageUsers = await hasPermission(user, "users.edit");
  const canManageRoles = await hasPermission(user, "roles.edit");
  if (!canManageUsers && !canManageRoles) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso administrativo não autorizado." });
}

export async function assertSuperAdministrator(user: CurrentUser) {
  if (user.openId === ENV.ownerOpenId) return;
  const snapshot = await getAccessSnapshot(user.id);
  if (hasSuperAdministratorAssignment(snapshot.assignments)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "Configurações gerais disponíveis somente para o perfil Super Administrador." });
}

export async function assertIntegrationApprovalAdministrator(user: CurrentUser) {
  if (user.operationalRole === "administrador") return;
  const snapshot = await getAccessSnapshot(user.id);
  if (hasAdministratorAssignment(snapshot.assignments)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "A pré-aprovação de integrações produtivas é permitida somente ao perfil Administrador." });
}
