import { and, eq } from "drizzle-orm";
import {
  auditLogs,
  workflowExecutions,
  workflowVersions,
  workflows,
} from "../../drizzle/schema";
import { getDb, validateWorkflowDefinition } from "../dbLegacy";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import {
  advanceWorkflowInstanceState,
  cancelWorkflowInstanceState,
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

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} inválido na definição do workflow.`);
  }
  return value.trim();
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
    return {
      id: requireNonEmptyString(node.id, "node.id"),
      type: requireNonEmptyString(node.type, "node.type"),
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

async function loadFrozenInstanceForTransition(
  tx: Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0],
  executionId: number,
) {
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
  actorUserId: number;
  correlationId: string;
  inputData?: Record<string, unknown> | null;
}): Promise<WorkflowInstanceResult> {
  const db = await requireDb();

  return db.transaction(async tx => {
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
  targetNodeId: string;
  actorUserId: number;
  correlationId: string;
}): Promise<WorkflowInstanceResult> {
  const db = await requireDb();

  return db.transaction(async tx => {
    const frozen = await loadFrozenInstanceForTransition(tx, input.executionId);
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

export async function cancelManualWorkflowInstance(input: {
  executionId: number;
  actorUserId: number;
  correlationId: string;
}): Promise<WorkflowInstanceResult> {
  const db = await requireDb();

  return db.transaction(async tx => {
    const frozen = await loadFrozenInstanceForTransition(tx, input.executionId);
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
