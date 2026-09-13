import { and, eq } from "drizzle-orm";
import { auditLogs, workflowExecutions } from "../../drizzle/schema";
import { getDb } from "../dbLegacy";
import { workflowTasks } from "./workflowTaskSchema";
import {
  assignWorkflowTaskState,
  claimWorkflowTaskState,
  completeWorkflowTaskState,
  createWorkflowTaskState,
  startWorkflowTaskState,
  type WorkflowTaskState,
} from "./workflowTaskStateMachine";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponivel.");
  return db;
}

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0];

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

export async function createWorkflowTask(input: {
  executionId: number;
  nodeId: string;
  actorUserId: number;
  assigneeUserId?: number | null;
  correlationId: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const execution = (await tx.select().from(workflowExecutions).where(eq(workflowExecutions.id, input.executionId)).limit(1))[0];
    if (!execution) throw new Error("Instancia de workflow nao encontrada.");
    if (execution.mode !== "simulacao") throw new Error("D-012D aceita somente workflow em simulacao.");
    if (!execution.workflowVersionId) throw new Error("Instancia sem workflowVersionId congelado.");
    const existing = (await tx.select().from(workflowTasks).where(and(
      eq(workflowTasks.executionId, input.executionId),
      eq(workflowTasks.nodeId, input.nodeId),
    )).limit(1))[0];
    if (existing) return existing;
    const now = new Date();
    const occurredAt = now.toISOString();
    const change = createWorkflowTaskState({
      executionId: input.executionId,
      workflowVersionId: execution.workflowVersionId,
      nodeId: input.nodeId,
      assigneeUserId: input.assigneeUserId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt,
    });
    const [created] = await tx.insert(workflowTasks).values({ ...change.state, createdByUserId: input.actorUserId }).$returningId();
    if (!created?.id) throw new Error("Falha ao persistir tarefa de workflow.");
    await auditTask(tx, { taskId: created.id, action: "create", actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt, before: null, after: change.state });
    return { id: created.id, ...change.state };
  });
}

export async function assignWorkflowTask(input: { taskId: number; assigneeUserId: number; actorUserId: number; correlationId: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const task = await loadTaskForUpdate(tx, input.taskId);
    const before = toState(task);
    const occurredAt = new Date().toISOString();
    const change = assignWorkflowTaskState({ state: before, assigneeUserId: input.assigneeUserId, actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt });
    await tx.update(workflowTasks).set({ assigneeUserId: change.state.assigneeUserId }).where(eq(workflowTasks.id, input.taskId));
    await auditTask(tx, { taskId: input.taskId, action: "assign", actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt, before, after: change.state });
    return { id: input.taskId, ...change.state };
  });
}

export async function claimWorkflowTask(input: { taskId: number; actorUserId: number; correlationId: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
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

export async function startWorkflowTask(input: { taskId: number; actorUserId: number; correlationId: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
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

export async function completeWorkflowTask(input: { taskId: number; actorUserId: number; correlationId: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const task = await loadTaskForUpdate(tx, input.taskId);
    const before = toState(task);
    const now = new Date();
    const occurredAt = now.toISOString();
    const change = completeWorkflowTaskState({ state: before, actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt });
    await tx.update(workflowTasks).set({ status: change.state.status, completedAt: now }).where(eq(workflowTasks.id, input.taskId));
    await auditTask(tx, { taskId: input.taskId, action: "complete", actorUserId: input.actorUserId, correlationId: input.correlationId, occurredAt, before, after: change.state });
    return { id: input.taskId, ...change.state };
  });
}
