import { and, desc, eq } from "drizzle-orm";
import { users, workflowExecutions, workflows } from "../../drizzle/schema";
import {
  deleteSimulatedWorkflow,
  getDb,
  getSimulatedWorkflow,
  getSimulatedWorkflowExecution,
  updateSimulatedWorkflow,
} from "../dbLegacy";
import { assertWorkflowTenant } from "./workflowTenantAccess";
import { createSimulatedWorkflowWithTenant } from "./workflowTenantCreationPersistence";
import { workflowExecutionTenantScopes, workflowTenantScopes } from "./workflowTenantScopeSchema";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function listSimulatedWorkflowsForTenant(organizationId: number) {
  const db = await requireDb();
  return db
    .select({ workflow: workflows, creatorName: users.name })
    .from(workflows)
    .innerJoin(workflowTenantScopes, eq(workflowTenantScopes.workflowId, workflows.id))
    .leftJoin(users, eq(workflows.createdByUserId, users.id))
    .where(eq(workflowTenantScopes.organizationId, organizationId))
    .orderBy(desc(workflows.updatedAt));
}

export async function getSimulatedWorkflowForTenant(workflowId: number, organizationId: number) {
  const db = await requireDb();
  await assertWorkflowTenant(db as any, workflowId, organizationId);
  return getSimulatedWorkflow(workflowId);
}

export async function createSimulatedWorkflowForTenant(input: {
  name: string;
  description?: string | null;
  organizationId: number;
  actorUserId: number;
}) {
  return createSimulatedWorkflowWithTenant(input);
}

export async function updateSimulatedWorkflowForTenant(input: {
  workflowId: number;
  organizationId: number;
  name: string;
  description?: string | null;
  definition?: unknown;
  changeSummary?: string | null;
  actorUserId: number;
}) {
  const db = await requireDb();
  await assertWorkflowTenant(db as any, input.workflowId, input.organizationId);
  const { organizationId: _organizationId, ...legacyInput } = input;
  return updateSimulatedWorkflow(legacyInput);
}

export async function deleteSimulatedWorkflowForTenant(input: {
  workflowId: number;
  organizationId: number;
  actorUserId: number;
}) {
  const db = await requireDb();
  await assertWorkflowTenant(db as any, input.workflowId, input.organizationId);
  return deleteSimulatedWorkflow({ workflowId: input.workflowId, actorUserId: input.actorUserId });
}

export async function listSimulatedWorkflowExecutionsForTenant(
  organizationId: number,
  input: { workflowId?: number; limit?: number } = {},
) {
  const db = await requireDb();
  const filters = [
    eq(workflowExecutions.mode, "simulacao"),
    eq(workflowExecutionTenantScopes.organizationId, organizationId),
  ];
  if (input.workflowId) filters.push(eq(workflowExecutions.workflowId, input.workflowId));
  return db
    .select({ execution: workflowExecutions, workflowName: workflows.name, initiatorName: users.name })
    .from(workflowExecutions)
    .innerJoin(workflowExecutionTenantScopes, eq(workflowExecutionTenantScopes.executionId, workflowExecutions.id))
    .innerJoin(workflows, eq(workflows.id, workflowExecutions.workflowId))
    .leftJoin(users, eq(users.id, workflowExecutions.initiatedByUserId))
    .where(and(...filters))
    .orderBy(desc(workflowExecutions.createdAt))
    .limit(Math.min(input.limit ?? 50, 100));
}

async function assertExecutionTenantForRead(executionId: number, organizationId: number) {
  const db = await requireDb();
  const scope = (await db
    .select({ organizationId: workflowExecutionTenantScopes.organizationId })
    .from(workflowExecutionTenantScopes)
    .where(eq(workflowExecutionTenantScopes.executionId, executionId))
    .limit(1))[0];
  if (!scope?.organizationId) throw new Error("Execução sem escopo de tenant mapeado.");
  if (scope.organizationId !== organizationId) throw new Error("Execução pertence a outra organização.");
}

export async function getSimulatedWorkflowExecutionForTenant(executionId: number, organizationId: number) {
  await assertExecutionTenantForRead(executionId, organizationId);
  return getSimulatedWorkflowExecution(executionId);
}
