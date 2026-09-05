import { TRPCError } from "@trpc/server";
import { assertPermission, assertTeamScope } from "./accessControl";

export const WORK_SHIFT_OPERATIONS_PERMISSIONS = {
  view: "work_shift_operations.view",
  manage: "work_shift_operations.manage",
} as const;

type WorkShiftOperationsUser = Parameters<typeof assertPermission>[0];

export async function assertWorkShiftOperationsView(user: WorkShiftOperationsUser, teamId?: number) {
  await assertPermission(user, WORK_SHIFT_OPERATIONS_PERMISSIONS.view);
  if (teamId !== undefined) {
    await assertTeamScope(user, teamId, WORK_SHIFT_OPERATIONS_PERMISSIONS.view);
  }
}

export async function assertWorkShiftOperationsManage(user: WorkShiftOperationsUser, teamId?: number) {
  await assertPermission(user, WORK_SHIFT_OPERATIONS_PERMISSIONS.manage);
  if (teamId !== undefined) {
    await assertTeamScope(user, teamId, WORK_SHIFT_OPERATIONS_PERMISSIONS.manage);
  }
}

export function assertWorkShiftOperationsTenant(expectedTenantId: number, actualTenantId: number) {
  if (expectedTenantId !== actualTenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Operação fora do tenant autorizado." });
  }
}
