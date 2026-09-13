import { eq } from "drizzle-orm";
import { workflowTenantScopes } from "./workflowTenantScopeSchema";

export type WorkflowTenantTransaction = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

export async function getWorkflowTenant(tx: WorkflowTenantTransaction, workflowId: number) {
  const row = (await tx
    .select({ organizationId: workflowTenantScopes.organizationId })
    .from(workflowTenantScopes)
    .where(eq(workflowTenantScopes.workflowId, workflowId))
    .limit(1))[0] as { organizationId: number } | undefined;

  return row?.organizationId ?? null;
}

export async function assertWorkflowTenant(
  tx: WorkflowTenantTransaction,
  workflowId: number,
  organizationId: number,
) {
  const scopedOrganizationId = await getWorkflowTenant(tx, workflowId);
  if (scopedOrganizationId === null) {
    throw new Error("Workflow sem escopo de tenant mapeado.");
  }
  if (scopedOrganizationId !== organizationId) {
    throw new Error("Workflow pertence a outra organização.");
  }
  return scopedOrganizationId;
}

export async function createWorkflowTenantScope(
  tx: WorkflowTenantTransaction,
  workflowId: number,
  organizationId: number,
) {
  await tx.insert(workflowTenantScopes).values({ workflowId, organizationId });
  return { workflowId, organizationId };
}
