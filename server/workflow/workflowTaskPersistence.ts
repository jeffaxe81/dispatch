import { eq } from "drizzle-orm";
import { auditLogs, workflowExecutions, workflowVersions } from "../../drizzle/schema";
import { getDb } from "../dbLegacy";
import { readWorkflowFormEvidence } from "./workflowFormEventEvidence";
import { workflowFormRequirementFromDefinition } from "./workflowFormRequirement";
import {
  calculateWorkflowSlaTimeline,
  workflowSlaConfigurationSchema,
} from "./workflowSla";
import { workflowTasks } from "./workflowTaskSchema";
import {
  assignWorkflowTaskState,
  claimWorkflowTaskState,
  completeWorkflowTaskState,
  startWorkflowTaskState,
  type WorkflowTaskState,
} from "./workflowTaskStateMachine";
import { assertAssigneeAuthorizedForTenant, assertTaskTenant } from "./workflowTaskTenantPolicy";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponivel.");
  return db;
}

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0];

export function buildWorkflowTaskSlaPersistenceValues(
  configurationInput: unknown,
  occurredAt: string,
): {
  slaStartedAt: Date | null;
  slaReminderAt: Date | null;
  slaDueAt: Date | null;
  slaEscalationAt: Date | null;
} {
  if (configurationInput === null || configurationInput === undefined) {
    return {
      slaStartedAt: null,
      slaReminderAt: null,
      slaDueAt: null,
      slaEscalationAt: null,
    };
  }

  const configuration = workflowSlaConfigurationSchema.parse(configurationInput);
  const timeline = calculateWorkflowSlaTimeline(configuration, occurredAt);
  return {
    slaStartedAt: new Date(timeline.startedAt),
    slaReminderAt: new Date(timeline.reminderAt),
    slaDueAt: new Date(timeline.dueAt),
    slaEscalationAt: new Date(timeline.escalationAt),
  };
}

function toState(row: typeof workflowTasks.$inferSelect): WorkflowTaskState {
  return {
    executionId: row.executionId,
    workflowVersionId: row.workflowVersionId,
    nodeId: row.nodeId,
    status: row.status,
    assigneeUserId: row.assigneeUserId,
  };
}

async function loadTaskForUpdate(tx: Tx, taskId: number) {
  const rows = await tx.select().from(workflowTasks).where(eq(workflowTasks.id, taskId)).limit(1).for("update");
  const task = rows[0];
  if (!task) throw new Error("Tarefa de workflow nao encontrada.");
  return task;
}

async function auditTask(tx: Tx, input: {
  taskId: number;
  action: string;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
  before: WorkflowTaskState | null;
  after: WorkflowTaskState;
}) {
  await tx.insert(auditLogs).values({
    resourceType: "workflow_task",
    resourceId: input.taskId,
    action: `workflow_task.${input.action}`,
    actorUserId: input.actorUserId,
    beforeData: input.before,
    afterData: { ...input.after, correlationId: input.correlationId, occurredAt: input.occurredAt },
  });
}

export async function assignWorkflowTask(input: {
  taskId: number;
  organizationId: number;
  assigneeUserId: number;
  actorUserId: number;
  correlationId: string;
}) {
  const db = await requireDb();
  await assertAssigneeAuthorizedForTenant(input.assigneeUserId, input.organizationId);
  return db.transaction(async tx => {
    await assertTaskTenant(tx, input.taskId, input.organizationId);
    const task = await loadTaskForUpdate(tx, input.taskId);
    const before = toState(task);
    const occurredAt = new Date().toISOString();
    const change = assignWorkflowTaskState({ state: before, assigneeUserId: input.assigneeUserId, actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt });
    await tx.update(workflowTasks).set({ assigneeUserId: change.state.assigneeUserId }).where(eq(workflowTasks.id, input.taskId));
    await auditTask(tx, { taskId: input.taskId, action: "assign", actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt, before, after: change.state });
    return { id: input.taskId, ...change.state };
  });
}

export async function claimWorkflowTask(input: {
  taskId: number;
  organizationId: number;
  actorUserId: number;
  correlationId: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    await assertTaskTenant(tx, input.taskId, input.organizationId);
    const task = await loadTaskForUpdate(tx, input.taskId);
    const before = toState(task);
    const now = new Date();
    const occurredAt = now.toISOString();
    const change = claimWorkflowTaskState({ state: before, actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt });
    await tx.update(workflowTasks).set({ status: change.state.status, assigneeUserId: change.state.assigneeUserId, claimedAt: now, startedAt: now }).where(eq(workflowTasks.id, input.taskId));
    await auditTask(tx, { taskId: input.taskId, action: "claim", actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt, before, after: change.state });
    return { id: input.taskId, ...change.state };
  });
}

export async function startWorkflowTask(input: {
  taskId: number;
  organizationId: number;
  actorUserId: number;
  correlationId: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    await assertTaskTenant(tx, input.taskId, input.organizationId);
    const task = await loadTaskForUpdate(tx, input.taskId);
    const before = toState(task);
    const now = new Date();
    const occurredAt = now.toISOString();
    const change = startWorkflowTaskState({ state: before, actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt });
    await tx.update(workflowTasks).set({ status: change.state.status, startedAt: now }).where(eq(workflowTasks.id, input.taskId));
    await auditTask(tx, { taskId: input.taskId, action: "start", actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt, before, after: change.state });
    return { id: input.taskId, ...change.state };
  });
}

export async function completeWorkflowTask(input: {
  taskId: number;
  organizationId: number;
  actorUserId: number;
  correlationId: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    await assertTaskTenant(tx, input.taskId, input.organizationId);
    const task = await loadTaskForUpdate(tx, input.taskId);
    const before = toState(task);
    const execution = (
      await tx
        .select()
        .from(workflowExecutions)
        .where(eq(workflowExecutions.id, task.executionId))
        .limit(1)
    )[0];
    if (!execution || execution.workflowVersionId !== task.workflowVersionId) {
      throw new Error("Tarefa não corresponde à versão congelada da execução.");
    }
    const version = (
      await tx
        .select()
        .from(workflowVersions)
        .where(eq(workflowVersions.id, task.workflowVersionId))
        .limit(1)
    )[0];
    if (!version || version.workflowId !== execution.workflowId) {
      throw new Error("Versão congelada da tarefa não foi encontrada.");
    }
    const formRequirement = workflowFormRequirementFromDefinition(
      version.definition,
      task.nodeId,
    );
    const formSubmissionEvidence = formRequirement
      ? readWorkflowFormEvidence(execution.outputData, task.nodeId)
      : null;

    const now = new Date();
    const occurredAt = now.toISOString();
    const change = completeWorkflowTaskState({
      state: before,
      ...(formRequirement ? { formRequirement, formSubmissionEvidence } : {}),
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt,
    });
    await tx.update(workflowTasks).set({ status: change.state.status, completedAt: now }).where(eq(workflowTasks.id, input.taskId));
    await auditTask(tx, { taskId: input.taskId, action: "complete", actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt, before, after: change.state });
    return { id: input.taskId, ...change.state };
  });
}
