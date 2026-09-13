import { eq } from "drizzle-orm";
import { auditLogs, users } from "../../drizzle/schema";
import { getDb } from "../dbLegacy";
import {
  isWorkflowTaskClaimEligible,
  parseHumanTaskAssignment,
  type WorkflowTaskStatus,
} from "./workflowTaskDomain";
import { workflowTaskEvents, workflowTasks } from "./workflowTaskSchema";

type WorkflowTaskAction = "claim" | "start";

type WorkflowTaskResult = {
  taskId: number;
  executionId: number;
  nodeId: string;
  status: WorkflowTaskStatus;
  claimedByUserId: number | null;
  correlationId: string;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} deve ser um inteiro positivo.`);
}

function assertCorrelationId(value: string) {
  if (!value.trim()) throw new Error("correlationId é obrigatório.");
}

function snapshotTask(task: {
  id: number;
  executionId: number;
  nodeId: string;
  status: WorkflowTaskStatus;
  claimedByUserId: number | null;
  correlationId: string;
}) {
  return {
    taskId: task.id,
    executionId: task.executionId,
    nodeId: task.nodeId,
    status: task.status,
    claimedByUserId: task.claimedByUserId,
    correlationId: task.correlationId,
  };
}

function taskResult(task: {
  id: number;
  executionId: number;
  nodeId: string;
  status: WorkflowTaskStatus;
  claimedByUserId: number | null;
  correlationId: string;
}): WorkflowTaskResult {
  return {
    taskId: task.id,
    executionId: task.executionId,
    nodeId: task.nodeId,
    status: task.status,
    claimedByUserId: task.claimedByUserId,
    correlationId: task.correlationId,
  };
}

async function appendTaskTransition(
  tx: Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0],
  input: {
    taskId: number;
    actorUserId: number;
    action: WorkflowTaskAction;
    correlationId: string;
    beforeData: Record<string, unknown>;
    afterData: Record<string, unknown>;
  },
) {
  await tx.insert(workflowTaskEvents).values({
    taskId: input.taskId,
    action: input.action,
    actorUserId: input.actorUserId,
    beforeData: input.beforeData,
    afterData: input.afterData,
    correlationId: input.correlationId,
  });

  await tx.insert(auditLogs).values({
    resourceType: "workflow_task",
    resourceId: input.taskId,
    action: `workflow_task.${input.action}`,
    actorUserId: input.actorUserId,
    beforeData: input.beforeData,
    afterData: input.afterData,
  });
}

export async function claimWorkflowTask(input: {
  taskId: number;
  actorUserId: number;
  correlationId: string;
}): Promise<WorkflowTaskResult> {
  assertPositiveInteger(input.taskId, "taskId");
  assertPositiveInteger(input.actorUserId, "actorUserId");
  assertCorrelationId(input.correlationId);

  const db = await requireDb();
  return db.transaction(async tx => {
    const task = (
      await tx
        .select()
        .from(workflowTasks)
        .where(eq(workflowTasks.id, input.taskId))
        .limit(1)
        .for("update")
    )[0];
    if (!task) throw new Error("Tarefa de workflow não encontrada.");
    if (task.status !== "open") throw new Error("Somente tarefa open pode receber claim.");

    if (task.claimedByUserId === input.actorUserId) {
      return taskResult(task);
    }
    if (task.claimedByUserId !== null) {
      throw new Error("A tarefa já foi assumida por outro usuário.");
    }

    const actor = (
      await tx
        .select({
          id: users.id,
          active: users.active,
          teamId: users.teamId,
          operationalRole: users.operationalRole,
        })
        .from(users)
        .where(eq(users.id, input.actorUserId))
        .limit(1)
    )[0];
    if (!actor) throw new Error("Usuário do claim não encontrado.");

    const assignment = parseHumanTaskAssignment({
      assignmentType: task.assignmentType,
      assigneeUserId: task.assigneeUserId,
      assigneeTeamId: task.assigneeTeamId,
      assigneeRole: task.assigneeRole,
    });
    if (!isWorkflowTaskClaimEligible(assignment, actor)) {
      throw new Error("Usuário não é elegível para assumir esta tarefa.");
    }

    const beforeData = snapshotTask(task);
    const now = new Date();
    await tx
      .update(workflowTasks)
      .set({
        claimedByUserId: input.actorUserId,
        claimedAt: now,
        correlationId: input.correlationId,
      })
      .where(eq(workflowTasks.id, input.taskId));

    const afterTask = {
      ...task,
      claimedByUserId: input.actorUserId,
      claimedAt: now,
      correlationId: input.correlationId,
    };
    const afterData = snapshotTask(afterTask);
    await appendTaskTransition(tx, {
      taskId: input.taskId,
      actorUserId: input.actorUserId,
      action: "claim",
      correlationId: input.correlationId,
      beforeData,
      afterData,
    });

    return taskResult(afterTask);
  });
}

export async function startWorkflowTask(input: {
  taskId: number;
  actorUserId: number;
  correlationId: string;
}): Promise<WorkflowTaskResult> {
  assertPositiveInteger(input.taskId, "taskId");
  assertPositiveInteger(input.actorUserId, "actorUserId");
  assertCorrelationId(input.correlationId);

  const db = await requireDb();
  return db.transaction(async tx => {
    const task = (
      await tx
        .select()
        .from(workflowTasks)
        .where(eq(workflowTasks.id, input.taskId))
        .limit(1)
        .for("update")
    )[0];
    if (!task) throw new Error("Tarefa de workflow não encontrada.");
    if (task.status !== "open") throw new Error("Somente tarefa open pode ser iniciada.");
    if (task.claimedByUserId === null) throw new Error("A tarefa precisa de claim antes do start.");
    if (task.claimedByUserId !== input.actorUserId) throw new Error("Somente o claimant pode iniciar a tarefa.");

    const beforeData = snapshotTask(task);
    const now = new Date();
    await tx
      .update(workflowTasks)
      .set({
        status: "in_progress",
        startedAt: now,
        correlationId: input.correlationId,
      })
      .where(eq(workflowTasks.id, input.taskId));

    const afterTask = {
      ...task,
      status: "in_progress" as const,
      startedAt: now,
      correlationId: input.correlationId,
    };
    const afterData = snapshotTask(afterTask);
    await appendTaskTransition(tx, {
      taskId: input.taskId,
      actorUserId: input.actorUserId,
      action: "start",
      correlationId: input.correlationId,
      beforeData,
      afterData,
    });

    return taskResult(afterTask);
  });
}
