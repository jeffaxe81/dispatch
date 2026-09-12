import { TRPCError } from "@trpc/server";
import { getAccessSnapshot, resolveAuthorizedTeamFilter, assertPermission, assertTeamScope } from "./accessControl";

export const WORK_SHIFT_OPERATIONS_PERMISSIONS = {
  view: "work_shift_operations.view",
  manage: "work_shift_operations.manage",
} as const;

type WorkShiftOperationsUser = Parameters<typeof assertPermission>[0];
type AuthorizedOperationsScope = { tenantId: number; teamId?: number };

async function resolveTenantFromAssignments(
  user: WorkShiftOperationsUser,
  permission: string,
  teamId?: number,
  activeTenantId?: number,
): Promise<AuthorizedOperationsScope> {
  const authorizedTeamId = await resolveAuthorizedTeamFilter(user, teamId, permission);
  const snapshot = await getAccessSnapshot(user.id);
  const organizationIds = Array.from(new Set(snapshot.assignments.map(item => item.organizationId).filter((value): value is number => value !== null)));

  if (activeTenantId) {
    const hasGlobalScope = snapshot.assignments.some(item => item.defaultScope === "global");
    if (!hasGlobalScope && organizationIds.length > 0 && !organizationIds.includes(activeTenantId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "A empresa ativa está fora do escopo autorizado para operação de jornada." });
    }
    if (authorizedTeamId !== undefined) await assertTeamScope(user, authorizedTeamId, permission, activeTenantId);
    return { tenantId: activeTenantId, teamId: authorizedTeamId };
  }

  if (organizationIds.length === 1) return { tenantId: organizationIds[0], teamId: authorizedTeamId };
  throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um escopo que determine uma única organização para a operação de jornada." });
}

export async function resolveWorkShiftOperationsViewScope(user: WorkShiftOperationsUser, teamId?: number, activeTenantId?: number) {
  return resolveTenantFromAssignments(user, WORK_SHIFT_OPERATIONS_PERMISSIONS.view, teamId, activeTenantId);
}

export async function resolveWorkShiftOperationsManageScope(user: WorkShiftOperationsUser, teamId?: number, activeTenantId?: number) {
  return resolveTenantFromAssignments(user, WORK_SHIFT_OPERATIONS_PERMISSIONS.manage, teamId, activeTenantId);
}

export async function assertWorkShiftOperationsView(user: WorkShiftOperationsUser, teamId?: number, activeTenantId?: number) {
  await assertPermission(user, WORK_SHIFT_OPERATIONS_PERMISSIONS.view);
  if (teamId !== undefined) await assertTeamScope(user, teamId, WORK_SHIFT_OPERATIONS_PERMISSIONS.view, activeTenantId);
}

export async function assertWorkShiftOperationsManage(user: WorkShiftOperationsUser, teamId?: number, activeTenantId?: number) {
  await assertPermission(user, WORK_SHIFT_OPERATIONS_PERMISSIONS.manage);
  if (teamId !== undefined) await assertTeamScope(user, teamId, WORK_SHIFT_OPERATIONS_PERMISSIONS.manage, activeTenantId);
}

export function assertWorkShiftOperationsTenant(expectedTenantId: number, actualTenantId: number) {
  if (expectedTenantId !== actualTenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Operação fora do tenant autorizado." });
}
