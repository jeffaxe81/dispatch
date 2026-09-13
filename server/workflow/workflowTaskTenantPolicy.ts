import { and, eq } from "drizzle-orm";
import { accessRoles, userRoleAssignments, users } from "../../drizzle/schema";
import { getDb } from "../dbLegacy";
import { isUserAuthorizedForOrganization } from "./workflowAccessPolicy";
import { workflowTasks } from "./workflowTaskSchema";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";

export type WorkflowTaskTenantTransaction = {
  select: (...args: any[]) => any;
};

export async function assertTaskTenant(
  tx: WorkflowTaskTenantTransaction,
  taskId: number,
  organizationId: number,
) {
  const task = (await tx
    .select({ executionId: workflowTasks.executionId })
    .from(workflowTasks)
    .where(eq(workflowTasks.id, taskId))
    .limit(1))[0] as { executionId: number } | undefined;

  if (!task?.executionId) {
    throw new Error("Tarefa de workflow inexistente ou inválida.");
  }

  const scope = (await tx
    .select({ organizationId: workflowExecutionTenantScopes.organizationId })
    .from(workflowExecutionTenantScopes)
    .where(eq(workflowExecutionTenantScopes.executionId, task.executionId))
    .limit(1))[0] as { organizationId: number } | undefined;

  if (!scope?.organizationId) {
    throw new Error("Tarefa de workflow sem escopo de tenant mapeado.");
  }
  if (scope.organizationId !== organizationId) {
    throw new Error("Tarefa de workflow pertence a outra organização.");
  }

  return scope.organizationId;
}

export async function assertAssigneeAuthorizedForTenant(userId: number, organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const user = (await db
    .select({ id: users.id, active: users.active })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1))[0] as { id: number; active: boolean } | undefined;

  if (!user?.active) {
    throw new Error("Responsável inativo ou não autorizado para o tenant.");
  }

  const assignments = await db
    .select({
      organizationId: userRoleAssignments.organizationId,
      defaultScope: accessRoles.defaultScope,
    })
    .from(userRoleAssignments)
    .innerJoin(accessRoles, eq(userRoleAssignments.roleId, accessRoles.id))
    .where(and(
      eq(userRoleAssignments.userId, userId),
      eq(userRoleAssignments.active, true),
      eq(accessRoles.active, true),
    ));

  if (!isUserAuthorizedForOrganization(assignments as any, organizationId)) {
    throw new Error("Responsável não autorizado para o tenant informado.");
  }

  return userId;
}
