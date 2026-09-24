import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  workflowExecutions,
  workflowVersions,
  workflows,
} from "../../drizzle/schema";
import { getDb, validateWorkflowDefinition } from "../dbLegacy";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import { workflowTasks } from "./workflowTaskSchema";
import {
  cancelWorkflowTaskState,
  createWorkflowTaskState,
  type WorkflowTaskState,
} from "./workflowTaskStateMachine";
import { assertWorkflowTenant } from "./workflowTenantAccess";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";
import {
  advanceWorkflowInstanceState,
  cancelWorkflowInstanceState,
  resumeEventWaitingWorkflowInstanceState,
  resumeWaitingWorkflowInstanceState,
  startManualWorkflowInstanceState,
  type WorkflowInstanceGraph,
  type WorkflowInstanceState,
  type WorkflowInstanceStatus,
} from "./workflowInstanceStateMachine";

type WorkflowExecutionDbStatus = "pendente" | "em_execucao" | "concluida" | "falha" | "cancelada" | "dead_letter";

type WorkflowInstanceResult = {
  executionId: number;
  workflowId: number;
  workflowVersionId: number;
  currentNodeId: string;
  status: WorkflowExecutionDbStatus;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

type WorkflowTx = Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0];

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} inválido na definição do workflow.`);
  }
  return value.trim();
}

function taskConfiguration(raw: unknown) {
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

function taskAssignee(configuration: Record<string, unknown>) {
  const raw = configuration.assigneeUserId;
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("assigneeUserId inválido na etapa humana do workflow.");
  }
  return value;
}

function toWorkflowInstanceGraph(definition: Record<string, unknown>): WorkflowInstanceGraph {
  if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
    throw new Error("A definição publicada do workflow não possui grafo válido.");
  }

  const nodes = definition.nodes.map((rawNode, index) => {
    if (!rawNode || typeof rawNode !== "object") {
      throw new Error(`Nó ${index + 1} inválido na definição do workflow.`);
    }
    const node = rawNode as Record<string, unknown>;
    const configuration = taskConfiguration(node.configuration);
    if (configuration.requiresHumanTask !== undefined && typeof configuration.requiresHumanTask !== "boolean") {
      throw new Error("requiresHumanTask deve ser boolean na definição do workflow.");
    }
    const requiresHumanTask = configuration.requiresHumanTask === true;
    return {
      id: requireNonEmptyString(node.id, "node.id"),
      type: requireNonEmptyString(node.type, "node.type"),
      ...(requiresHumanTask ? {
        requiresHumanTask: true,
        assigneeUserId: taskAssignee(configuration),
      } : {}),
    };
  });

  const edges = definition.edges.map((rawEdge, index) => {
    if (!rawEdge || typeof rawEdge !== "object") {
      throw new Error(`Aresta ${index + 1} inválida na definição do workflow.`);
    }
    const edge = rawEdge as Record<string, unknown>;
    const id = typeof edge.id === "string" && edge.id.trim() ? edge.id.trim() : undefined;
    return {
      ...(id ? { id } : {}),
      source: requireNonEmptyString(edge.source, "edge.source"),
      target: requireNonEmptyString(edge.target, "edge.target"),
    };
  });

  return { nodes, edges };
}

function validateAndBuildGraph(definition: Record<string, unknown>): WorkflowInstanceGraph {
  const validation = validateWorkflowDefinition(definition, { forPublication: true });
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }
  return toWorkflowInstanceGraph(definition);
}

function stateStatusFromDb(status: WorkflowExecutionDbStatus): WorkflowInstanceStatus {
  switch (status) {
    case "pendente":
      return "waiting";
    case "em_execucao":
      return "running";
    case "concluida":
      return "completed";
    case "cancelada":
      return "cancelled";
    case "falha":
    case "dead_letter":
      return "failed";
  }
}

function dbStatusFromState(status: WorkflowInstanceStatus): WorkflowExecutionDbStatus {
  switch (status) {
    case "waiting":
      return "pendente";
    case "running":
      return "em_execucao";
    case "completed":
      return "concluida";
    case "cancelled":
      return "cancelada";
    case "failed":
      return "falha";
  }
}

function buildWorkflowInstanceAuditLog(input: {
  executionId: number;
  workflowId: number;
  workflowVersionId: number;
  actorUserId: number;
  action: "start" | "advance" | "complete" | "cancel";
  fromNodeId: string | null;
  toNodeId: string | null;
  correlationId: string;
  occurredAt: string;
  beforeStatus: WorkflowExecutionDbStatus | null;
  afterStatus: WorkflowExecutionDbStatus;
}) {
  return {
    resourceType: "workflow_instance",
    resourceId: input.executionId,
    action: `workflow_instance.${input.action}`,
    actorUserId: input.actorUserId,
    beforeData: input.beforeStatus === null
      ? null
      : {
          workflowId: input.workflowId,
          workflowVersionId: input.workflowVersionId,
          fromNodeId: input.fromNodeId,
          status: input.beforeStatus,
        },
    afterData: {
      workflowId: input.workflowId,
      workflowVersionId: input.workflowVersionId,
      toNodeId: input.toNodeId,
      status: input.afterStatus,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
      simulationOnly: true,
    },
  };
}

async function auditWorkflowTask(tx: WorkflowTx, input: {
  taskId: number;
  action: "create" | "cancel";
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
    afterData: {
      ...input.after,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
    },
  });
}

async function ensureWorkflowTaskForNode(tx: WorkflowTx, input: {
  executionId: number;
  workflowVersionId: number;
  nodeId: string;
  assigneeUserId: number | null;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}) {
  const existing = (
    await tx
      .select()
      .from(workflowTasks)
      .where(and(eq(workflowTasks.executionId, input.executionId), eq(workflowTasks.nodeId, input.nodeId)))
      .limit(1)
  )[0];
  if (existing) {
    if (existing.workflowVersionId !== input.workflowVersionId) {
      throw new Error("Tarefa existente não corresponde à versão congelada da instância.");
    }
    return existing;
  }

  const change = createWorkflowTaskState({
    executionId: input.executionId,
    workflowVersionId: input.workflowVersionId,
    nodeId: input.nodeId,
    assigneeUserId: input.assigneeUserId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
  });
  const [created] = await tx
    .insert(workflowTasks)
    .values({ ...change.state, createdByUserId: input.actorUserId })
    .$returningId();
  if (!created?.id) throw new Error("Falha ao persistir tarefa da etapa humana.");
  await auditWorkflowTask(tx, {
    taskId: created.id,
    action: "create",
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    before: null,
    after: change.state,
  });
  return { id: created.id, ...change.state };
}

async function cancelOpenTasksForExecution(tx: WorkflowTx, input: {
  executionId: number;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
  cancelledAt: Date;
}) {
  const tasks = await tx
    .select()
    .from(workflowTasks)
    .where(and(
      eq(workflowTasks.executionId, input.executionId),
      inArray(workflowTasks.status, ["open", "in_progress"]),
    ))
    .limit(1000);

  for (const task of tasks) {
    const before: WorkflowTaskState = {
      executionId: task.executionId,
      workflowVersionId: task.workflowVersionId,
      nodeId: task.nodeId,
      status: task.status,
      assigneeUserId: task.assigneeUserId,
    };
    const change = cancelWorkflowTaskState({
      state: before,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
    });
    await tx
      .update(workflowTasks)
      .set({ status: "cancelled", cancelledAt: input.cancelledAt })
      .where(eq(workflowTasks.id, task.id));
    await auditWorkflowTask(tx, {
      taskId: task.id,
      action: "cancel",
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
      before,
      after: change.state,
    });
  }
}

async function assertWorkflowExecutionTenant(
  tx: WorkflowTx,
  executionId: number,
  organizationId: number,
) {
  const scope = (
    await tx
      .select({ organizationId: workflowExecutionTenantScopes.organizationId })
      .from(workflowExecutionTenantScopes)
      .where(eq(workflowExecutionTenantScopes.executionId, executionId))
      .limit(1)
  )[0];
  if (!scope) throw new Error("Instância de workflow sem escopo de tenant mapeado.");
  if (scope.organizationId !== organizationId) throw new Error("Instância de workflow pertence a outra organização.");
  return scope.organizationId;
}

async function loadFrozenInstanceForTransition(
  tx: WorkflowTx,
  executionId: number,
  organizationId: number,
) {
  await assertWorkflowExecutionTenant(tx, executionId, organizationId);

  const execution = (
    await tx.select().from(workflowExecutions).where(eq(workflowExecutions.id, executionId)).limit(1)
  )[0];
  if (!execution) throw new Error("Instância de workflow não encontrada.");
  if (execution.mode !== "simulacao") throw new Error("A D-012C aceita somente instâncias em modo de simulação.");
  if (!execution.workflowVersionId) throw new Error("A instância não possui workflowVersionId congelado.");

  const projection = (
    await tx.select().from(workflowInstanceExecutions).where(eq(workflowInstanceExecutions.id, executionId)).limit(1)
  )[0];
  if (!projection?.currentNodeId) throw new Error("A instância não possui currentNodeId persistido.");

  const version = (
    await tx.select().from(workflowVersions).where(eq(workflowVersions.id, execution.workflowVersionId)).limit(1)
  )[0];
  if (!version) throw new Error("A versão congelada da instância não foi encontrada.");

  const graph = validateAndBuildGraph(version.definition);
  const state: WorkflowInstanceState = {
    workflowId: execution.workflowId,
    workflowVersionId: execution.workflowVersionId,
    currentNodeId: projection.currentNodeId,
    status: stateStatusFromDb(execution.status as WorkflowExecutionDbStatus),
  };

  return { execution, projection, version, graph, state };
}

export async function startManualWorkflowInstance(input: {
  workflowId: number;
  organizationId: number;
  actorUserId: number;
  correlationId: string;
  inputData?: Record<string, unknown> | null;
}): Promise<WorkflowInstanceResult> {
  const db = await requireDb();

  return db.transaction(async tx => {
    await assertWorkflowTenant(tx, input.workflowId, input.organizationId);

    const workflow = (
      await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1)
    )[0];
    if (!workflow) throw new Error("Workflow não encontrado.");
    if (!workflow.active) throw new Error("O workflow deve estar ativo antes de iniciar uma instância.");
    if (!workflow.simulationOnly) throw new Error("A D-012C inicia somente workflows em modo de simulação.");

    const pointer = (
      await tx
        .select()
        .from(workflowPublicationPointers)
        .where(eq(workflowPublicationPointers.id, input.workflowId))
        .limit(1)
    )[0];
    if (!pointer?.publishedVersion || pointer.publishedVersion < 1) {
      throw new Error("O workflow ativo não possui versão publicada válida.");
    }

    const version = (
      await tx
        .select()
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.workflowId, input.workflowId),
            eq(workflowVersions.version, pointer.publishedVersion),
          ),
        )
        .limit(1)
    )[0];
    if (!version) throw new Error("A versão publicada do workflow não foi encontrada.");

    const graph = validateAndBuildGraph(version.definition);
    const now = new Date();
    const occurredAt = now.toISOString();
    const started = startManualWorkflowInstanceState({
      workflowId: input.workflowId,
      workflowVersionId: version.id,
      graph,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt,
    });
    const status = dbStatusFromState(started.state.status);

    const [created] = await tx
      .insert(workflowExecutions)
      .values({
        workflowId: input.workflowId,
        workflowVersionId: version.id,
        triggerType: "manual",
        mode: "simulacao",
        status,
        inputData: {
          simulation: true,
          ...(input.inputData ?? {}),
        },
        attempts: 0,
        maxAttempts: 3,
        startedAt: now,
        initiatedByUserId: input.actorUserId,
      })
      .$returningId();
    if (!created?.id) throw new Error("Falha ao persistir a instância do workflow.");

    await tx.insert(workflowExecutionTenantScopes).values({
      executionId: created.id,
      organizationId: input.organizationId,
    });

    await tx
      .update(workflowInstanceExecutions)
      .set({
        currentNodeId: started.state.currentNodeId,
        correlationId: input.correlationId,
      })
      .where(eq(workflowInstanceExecutions.id, created.id));

    await tx.insert(auditLogs).values(
      buildWorkflowInstanceAuditLog({
        executionId: created.id,
        workflowId: input.workflowId,
        workflowVersionId: version.id,
        actorUserId: input.actorUserId,
        action: "start",
        fromNodeId: null,
        toNodeId: started.state.currentNodeId,
        correlationId: input.correlationId,
        occurredAt,
        beforeStatus: null,
        afterStatus: status,
      }),
    );

    return {
      executionId: created.id,
      workflowId: input.workflowId,
      workflowVersionId: version.id,
      currentNodeId: started.state.currentNodeId,
      status,
    };
  });
}

export async function advanceManualWorkflowInstance(input: {
  executionId: number;
  organizationId: number;
  targetNodeId: string;
  actorUserId: number;
  correlationId: string;
}): Promise<WorkflowInstanceResult> {
  const db = await requireDb();

  return db.transaction(async tx => {
    const frozen = await loadFrozenInstanceForTransition(tx, input.executionId, input.organizationId);
    const beforeStatus = frozen.execution.status as WorkflowExecutionDbStatus;
    const now = new Date();
    const occurredAt = now.toISOString();

    const advanced = advanceWorkflowInstanceState({
      state: frozen.state,
      graph: frozen.graph,
      targetNodeId: input.targetNodeId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt,
    });
    const status = dbStatusFromState(advanced.state.status);

    if (advanced.state.status === "waiting") {
      const waitingNode = frozen.graph.nodes.find(node => node.id === advanced.state.currentNodeId);
      if (!waitingNode) throw new Error("Estado waiting sem nó válido.");
      if (waitingNode.requiresHumanTask) {
        await ensureWorkflowTaskForNode(tx, {
          executionId: input.executionId,
          workflowVersionId: frozen.state.workflowVersionId,
          nodeId: waitingNode.id,
          assigneeUserId: waitingNode.assigneeUserId ?? null,
          actorUserId: input.actorUserId,
          correlationId: input.correlationId,
          occurredAt,
        });
      } else if (waitingNode.type !== "wait.event") {
        throw new Error("Estado waiting sem etapa humana ou wait.event válida.");
      }
    }

    await tx
      .update(workflowExecutions)
      .set({
        status,
        completedAt: advanced.state.status === "completed" ? now : null,
      })
      .where(eq(workflowExecutions.id, input.executionId));

    await tx
      .update(workflowInstanceExecutions)
      .set({
        currentNodeId: advanced.state.currentNodeId,
        correlationId: input.correlationId,
      })
      .where(eq(workflowInstanceExecutions.id, input.executionId));

    await tx.insert(auditLogs).values(
      buildWorkflowInstanceAuditLog({
        executionId: input.executionId,
        workflowId: frozen.state.workflowId,
        workflowVersionId: frozen.state.workflowVersionId,
        actorUserId: input.actorUserId,
        action: advanced.transition.action === "complete" ? "complete" : "advance",
        fromNodeId: advanced.transition.fromNodeId,
        toNodeId: advanced.transition.toNodeId,
        correlationId: input.correlationId,
        occurredAt,
        beforeStatus,
        afterStatus: status,
      }),
    );

    return {
      executionId: input.executionId,
      workflowId: frozen.state.workflowId,
      workflowVersionId: frozen.state.workflowVersionId,
      currentNodeId: advanced.state.currentNodeId,
      status,
    };
  });
}

export async function resumeManualWorkflowInstanceFromCompletedTask(input: {
  executionId: number;
  organizationId: number;
  taskId: number;
  targetNodeId?: string;
  actorUserId: number;
  correlationId: string;
}): Promise<WorkflowInstanceResult> {
  const db = await requireDb();

  return db.transaction(async tx => {
    const frozen = await loadFrozenInstanceForTransition(tx, input.executionId, input.organizationId);
    if (frozen.state.status !== "waiting") throw new Error("A instância não está aguardando tarefa.");
    const task = (await tx.select().from(workflowTasks).where(eq(workflowTasks.id, input.taskId)).limit(1))[0];
    if (!task) throw new Error("Tarefa de workflow não encontrada.");
    if (task.executionId !== input.executionId || task.workflowVersionId !== frozen.state.workflowVersionId || task.nodeId !== frozen.state.currentNodeId) {
      throw new Error("A tarefa não pertence ao nó atual da instância congelada.");
    }
    if (task.status !== "completed") throw new Error("A tarefa deve estar completed antes de retomar a instância.");

    const beforeStatus = frozen.execution.status as WorkflowExecutionDbStatus;
    const now = new Date();
    const occurredAt = now.toISOString();
    const resumed = resumeWaitingWorkflowInstanceState({
      state: frozen.state,
      graph: frozen.graph,
      targetNodeId: input.targetNodeId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt,
    });
    const status = dbStatusFromState(resumed.state.status);

    if (resumed.state.status === "waiting") {
      const waitingNode = frozen.graph.nodes.find(node => node.id === resumed.state.currentNodeId);
      if (!waitingNode) throw new Error("Estado waiting sem nó válido.");
      if (waitingNode.requiresHumanTask) {
        await ensureWorkflowTaskForNode(tx, {
          executionId: input.executionId,
          workflowVersionId: frozen.state.workflowVersionId,
          nodeId: waitingNode.id,
          assigneeUserId: waitingNode.assigneeUserId ?? null,
          actorUserId: input.actorUserId,
          correlationId: input.correlationId,
          occurredAt,
        });
      } else if (waitingNode.type !== "wait.event") {
        throw new Error("Estado waiting sem etapa humana ou wait.event válida.");
      }
    }

    await tx
      .update(workflowExecutions)
      .set({ status, completedAt: resumed.state.status === "completed" ? now : null })
      .where(eq(workflowExecutions.id, input.executionId));
    await tx
      .update(workflowInstanceExecutions)
      .set({ currentNodeId: resumed.state.currentNodeId, correlationId: input.correlationId })
      .where(eq(workflowInstanceExecutions.id, input.executionId));
    await tx.insert(auditLogs).values(
      buildWorkflowInstanceAuditLog({
        executionId: input.executionId,
        workflowId: frozen.state.workflowId,
        workflowVersionId: frozen.state.workflowVersionId,
        actorUserId: input.actorUserId,
        action: resumed.transition.action === "complete" ? "complete" : "advance",
        fromNodeId: resumed.transition.fromNodeId,
        toNodeId: resumed.transition.toNodeId,
        correlationId: input.correlationId,
        occurredAt,
        beforeStatus,
        afterStatus: status,
      }),
    );

    return {
      executionId: input.executionId,
      workflowId: frozen.state.workflowId,
      workflowVersionId: frozen.state.workflowVersionId,
      currentNodeId: resumed.state.currentNodeId,
      status,
    };
  });
}

export async function cancelManualWorkflowInstance(input: {
  executionId: number;
  organizationId: number;
  actorUserId: number;
  correlationId: string;
}): Promise<WorkflowInstanceResult> {
  const db = await requireDb();

  return db.transaction(async tx => {
    const frozen = await loadFrozenInstanceForTransition(tx, input.executionId, input.organizationId);
    const beforeStatus = frozen.execution.status as WorkflowExecutionDbStatus;
    const now = new Date();
    const occurredAt = now.toISOString();

    const cancelled = cancelWorkflowInstanceState({
      state: frozen.state,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt,
    });
    const status = dbStatusFromState(cancelled.state.status);

    await cancelOpenTasksForExecution(tx, {
      executionId: input.executionId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt,
      cancelledAt: now,
    });

    await tx
      .update(workflowExecutions)
      .set({ status, completedAt: now })
      .where(eq(workflowExecutions.id, input.executionId));

    await tx
      .update(workflowInstanceExecutions)
      .set({
        currentNodeId: cancelled.state.currentNodeId,
        correlationId: input.correlationId,
      })
      .where(eq(workflowInstanceExecutions.id, input.executionId));

    await tx.insert(auditLogs).values(
      buildWorkflowInstanceAuditLog({
        executionId: input.executionId,
        workflowId: frozen.state.workflowId,
        workflowVersionId: frozen.state.workflowVersionId,
        actorUserId: input.actorUserId,
        action: "cancel",
        fromNodeId: cancelled.transition.fromNodeId,
        toNodeId: cancelled.transition.toNodeId,
        correlationId: input.correlationId,
        occurredAt,
        beforeStatus,
        afterStatus: status,
      }),
    );

    return {
      executionId: input.executionId,
      workflowId: frozen.state.workflowId,
      workflowVersionId: frozen.state.workflowVersionId,
      currentNodeId: cancelled.state.currentNodeId,
      status,
    };
  });
}

export async function startEventWorkflowInstanceInTransaction(
  tx: WorkflowTx,
  input: {
    workflowId: number;
    workflowVersionId: number;
    organizationId: number;
    triggerNodeId: string;
    eventId: string;
    eventType: string;
    producer: string;
    actorUserId: number;
    correlationId: string;
    payload: Record<string, unknown>;
  },
): Promise<WorkflowInstanceResult> {
  await assertWorkflowTenant(tx, input.workflowId, input.organizationId);

  const workflow = (
    await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1)
  )[0];
  if (!workflow) throw new Error("Workflow não encontrado.");
  if (!workflow.active) throw new Error("O workflow deve estar ativo antes de iniciar uma instância.");
  if (!workflow.simulationOnly) throw new Error("A D-012F inicia somente workflows em modo de simulação.");

  const pointer = (
    await tx
      .select()
      .from(workflowPublicationPointers)
      .where(eq(workflowPublicationPointers.id, input.workflowId))
      .limit(1)
  )[0];
  if (!pointer?.publishedVersion || pointer.publishedVersion < 1) {
    throw new Error("O workflow ativo não possui versão publicada válida.");
  }

  const version = (
    await tx
      .select()
      .from(workflowVersions)
      .where(and(
        eq(workflowVersions.id, input.workflowVersionId),
        eq(workflowVersions.workflowId, input.workflowId),
        eq(workflowVersions.version, pointer.publishedVersion),
      ))
      .limit(1)
  )[0];
  if (!version || version.id !== input.workflowVersionId || version.version !== pointer.publishedVersion) {
    throw new Error("A versão publicada indicada pelo evento não está mais elegível.");
  }

  const graph = toWorkflowInstanceGraph(version.definition);
  const { startEventWorkflowInstanceState } = await import("./workflowInstanceStateMachine");
  const now = new Date();
  const occurredAt = now.toISOString();
  const started = startEventWorkflowInstanceState({
    workflowId: input.workflowId,
    workflowVersionId: version.id,
    graph,
    triggerNodeId: input.triggerNodeId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    occurredAt,
  });
  const status = dbStatusFromState(started.state.status);

  const [created] = await tx
    .insert(workflowExecutions)
    .values({
      workflowId: input.workflowId,
      workflowVersionId: version.id,
      triggerType: `event:${input.eventType}`,
      mode: "simulacao",
      status,
      idempotencyKey: `${input.organizationId}:${input.eventId}`,
      inputData: {
        simulation: true,
        eventId: input.eventId,
        eventType: input.eventType,
        producer: input.producer,
        payload: { ...input.payload },
      },
      attempts: 0,
      maxAttempts: 3,
      startedAt: now,
      initiatedByUserId: input.actorUserId,
    })
    .$returningId();
  if (!created?.id) throw new Error("Falha ao persistir a instância do workflow por evento.");

  await tx.insert(workflowExecutionTenantScopes).values({
    executionId: created.id,
    organizationId: input.organizationId,
  });

  await tx
    .update(workflowInstanceExecutions)
    .set({
      currentNodeId: started.state.currentNodeId,
      correlationId: input.correlationId,
    })
    .where(eq(workflowInstanceExecutions.id, created.id));

  await tx.insert(auditLogs).values(
    buildWorkflowInstanceAuditLog({
      executionId: created.id,
      workflowId: input.workflowId,
      workflowVersionId: version.id,
      actorUserId: input.actorUserId,
      action: "start",
      fromNodeId: null,
      toNodeId: started.state.currentNodeId,
      correlationId: input.correlationId,
      occurredAt,
      beforeStatus: null,
      afterStatus: status,
    }),
  );

  return {
    executionId: created.id,
    workflowId: input.workflowId,
    workflowVersionId: version.id,
    currentNodeId: started.state.currentNodeId,
    status,
  };
}


export async function resumeEventWorkflowInstanceInTransaction(
  tx: WorkflowTx,
  input: {
    executionId: number;
    workflowId: number;
    workflowVersionId: number;
    organizationId: number;
    currentNodeId: string;
    targetNodeId: string;
    eventId: string;
    eventType: string;
    producer: string;
    actorUserId: number;
    correlationId: string;
    payload: Record<string, unknown>;
  },
): Promise<WorkflowInstanceResult> {
  const frozen = await loadFrozenInstanceForTransition(tx, input.executionId, input.organizationId);
  if (frozen.state.workflowId !== input.workflowId || frozen.state.workflowVersionId !== input.workflowVersionId) {
    throw new Error("Instância waiting não corresponde ao workflow/version congelados.");
  }
  if (frozen.state.currentNodeId !== input.currentNodeId) {
    throw new Error("Instância waiting mudou de nó antes do processamento do evento.");
  }

  const definition = frozen.version.definition as Record<string, unknown>;
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const currentRaw = nodes.find(raw => {
    if (!raw || typeof raw !== "object") return false;
    return (raw as Record<string, unknown>).id === input.currentNodeId;
  }) as Record<string, unknown> | undefined;
  if (!currentRaw || currentRaw.type !== "wait.event") {
    throw new Error("Retomada por evento exige nó persistido wait.event.");
  }
  const configuration = taskConfiguration(currentRaw.configuration);
  if (configuration.eventType !== input.eventType) {
    throw new Error("Evento não corresponde ao eventType aguardado pela instância.");
  }

  const outgoing = frozen.graph.edges.filter(edge => edge.source === input.currentNodeId);
  if (outgoing.length !== 1) {
    throw new Error("Nó wait.event deve possuir exatamente uma saída.");
  }
  if (outgoing[0].target !== input.targetNodeId) {
    throw new Error("Destino do wait.event não corresponde à versão congelada.");
  }

  const beforeStatus = frozen.execution.status as WorkflowExecutionDbStatus;
  const now = new Date();
  const occurredAt = now.toISOString();
  const resumed = resumeEventWaitingWorkflowInstanceState({
    state: frozen.state,
    graph: frozen.graph,
    targetNodeId: input.targetNodeId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    occurredAt,
  });
  const status = dbStatusFromState(resumed.state.status);

  if (resumed.state.status === "waiting") {
    const waitingNode = frozen.graph.nodes.find(node => node.id === resumed.state.currentNodeId);
    if (!waitingNode) throw new Error("Estado waiting sem nó válido após evento.");
    if (waitingNode.requiresHumanTask) {
      await ensureWorkflowTaskForNode(tx, {
        executionId: input.executionId,
        workflowVersionId: frozen.state.workflowVersionId,
        nodeId: waitingNode.id,
        assigneeUserId: waitingNode.assigneeUserId ?? null,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
        occurredAt,
      });
    } else if (waitingNode.type !== "wait.event") {
      throw new Error("Estado waiting sem etapa humana ou wait.event válida após evento.");
    }
  }

  await tx
    .update(workflowExecutions)
    .set({
      status,
      completedAt: resumed.state.status === "completed" ? now : null,
    })
    .where(eq(workflowExecutions.id, input.executionId));
  await tx
    .update(workflowInstanceExecutions)
    .set({
      currentNodeId: resumed.state.currentNodeId,
      correlationId: input.correlationId,
    })
    .where(eq(workflowInstanceExecutions.id, input.executionId));
  await tx.insert(auditLogs).values(
    buildWorkflowInstanceAuditLog({
      executionId: input.executionId,
      workflowId: frozen.state.workflowId,
      workflowVersionId: frozen.state.workflowVersionId,
      actorUserId: input.actorUserId,
      action: resumed.transition.action === "complete" ? "complete" : "advance",
      fromNodeId: resumed.transition.fromNodeId,
      toNodeId: resumed.transition.toNodeId,
      correlationId: input.correlationId,
      occurredAt,
      beforeStatus,
      afterStatus: status,
    }),
  );

  return {
    executionId: input.executionId,
    workflowId: frozen.state.workflowId,
    workflowVersionId: frozen.state.workflowVersionId,
    currentNodeId: resumed.state.currentNodeId,
    status,
  };
}
