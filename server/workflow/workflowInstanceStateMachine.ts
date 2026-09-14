export type WorkflowInstanceStatus = "running" | "waiting" | "completed" | "cancelled" | "failed";

export type WorkflowInstanceGraphNode = {
  id: string;
  type: string;
  requiresHumanTask?: boolean;
  assigneeUserId?: number | null;
};

export type WorkflowInstanceGraphEdge = {
  id?: string;
  source: string;
  target: string;
};

export type WorkflowInstanceGraph = {
  nodes: WorkflowInstanceGraphNode[];
  edges: WorkflowInstanceGraphEdge[];
};

export type WorkflowInstanceState = {
  workflowId: number;
  workflowVersionId: number;
  currentNodeId: string;
  status: WorkflowInstanceStatus;
};

export type WorkflowInstanceTransitionAction = "start" | "advance" | "complete" | "cancel" | "fail";

export type WorkflowInstanceTransition = {
  action: WorkflowInstanceTransitionAction;
  fromNodeId: string | null;
  toNodeId: string | null;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
};

export type WorkflowInstanceStateChange = {
  state: WorkflowInstanceState;
  transition: WorkflowInstanceTransition;
};

const terminalStatuses = new Set<WorkflowInstanceStatus>(["completed", "cancelled", "failed"]);

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} deve ser um inteiro positivo.`);
  }
}

function assertTransitionMetadata(input: {
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}) {
  assertPositiveInteger(input.actorUserId, "actorUserId");
  if (!input.correlationId.trim()) {
    throw new Error("correlationId é obrigatório.");
  }
  if (!input.occurredAt.trim() || Number.isNaN(Date.parse(input.occurredAt))) {
    throw new Error("occurredAt deve ser uma data válida.");
  }
}

function assertGraph(graph: WorkflowInstanceGraph) {
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id.trim() || !node.type.trim()) {
      throw new Error("Nós do workflow devem possuir id e type.");
    }
    if (node.type.startsWith("trigger.") && node.requiresHumanTask) {
      throw new Error("Nós trigger não podem declarar requiresHumanTask.");
    }
    if (node.assigneeUserId != null) assertPositiveInteger(node.assigneeUserId, "assigneeUserId");
    if (nodeIds.has(node.id)) {
      throw new Error(`Nó duplicado no workflow: ${node.id}.`);
    }
    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error("A definição contém aresta apontando para nó inexistente.");
    }
  }
}

function assertMutableState(state: WorkflowInstanceState) {
  assertPositiveInteger(state.workflowId, "workflowId");
  assertPositiveInteger(state.workflowVersionId, "workflowVersionId");
  if (!state.currentNodeId.trim()) {
    throw new Error("currentNodeId é obrigatório.");
  }
  if (terminalStatuses.has(state.status)) {
    throw new Error("Instância terminal não pode sofrer nova transição.");
  }
}

function transition(input: {
  action: WorkflowInstanceTransitionAction;
  fromNodeId: string | null;
  toNodeId: string | null;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceTransition {
  assertTransitionMetadata(input);
  return { ...input };
}

function moveToTarget(input: {
  state: WorkflowInstanceState;
  graph: WorkflowInstanceGraph;
  targetNodeId: string;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  assertTransitionMetadata(input);
  assertGraph(input.graph);

  const currentNodeExists = input.graph.nodes.some(node => node.id === input.state.currentNodeId);
  if (!currentNodeExists) {
    throw new Error("O nó atual da instância não existe na versão congelada do workflow.");
  }

  const targetNode = input.graph.nodes.find(node => node.id === input.targetNodeId);
  if (!targetNode) {
    throw new Error("O nó de destino não existe na versão congelada do workflow.");
  }

  const allowed = input.graph.edges.some(
    edge => edge.source === input.state.currentNodeId && edge.target === input.targetNodeId,
  );
  if (!allowed) {
    throw new Error("Transição não permitida a partir do nó atual.");
  }

  const isTerminalTarget = !input.graph.edges.some(edge => edge.source === input.targetNodeId);
  const waitsForExternalEvent = targetNode.type === "wait.event";
  const status: WorkflowInstanceStatus = targetNode.requiresHumanTask || waitsForExternalEvent
    ? "waiting"
    : isTerminalTarget
      ? "completed"
      : "running";
  const action: WorkflowInstanceTransitionAction = status === "completed" ? "complete" : "advance";

  return {
    state: {
      ...input.state,
      currentNodeId: input.targetNodeId,
      status,
    },
    transition: transition({
      action,
      fromNodeId: input.state.currentNodeId,
      toNodeId: input.targetNodeId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
    }),
  };
}

function startWorkflowInstanceAtInitialTrigger(input: {
  workflowId: number;
  workflowVersionId: number;
  graph: WorkflowInstanceGraph;
  triggerType: "trigger.manual" | "trigger.external_data";
  triggerNodeId?: string;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  assertPositiveInteger(input.workflowId, "workflowId");
  assertPositiveInteger(input.workflowVersionId, "workflowVersionId");
  assertTransitionMetadata(input);
  assertGraph(input.graph);

  const incomingTargets = new Set(input.graph.edges.map(edge => edge.target));
  const initialTriggers = input.graph.nodes.filter(
    node => node.type === input.triggerType && !incomingTargets.has(node.id),
  );

  let currentNodeId: string;
  if (input.triggerNodeId) {
    const selected = initialTriggers.find(node => node.id === input.triggerNodeId);
    if (!selected) {
      throw new Error(`O workflow deve iniciar em um ${input.triggerType} inicial autorizado.`);
    }
    currentNodeId = selected.id;
  } else {
    if (initialTriggers.length !== 1) {
      throw new Error(`O workflow deve possuir exatamente um ${input.triggerType} inicial.`);
    }
    currentNodeId = initialTriggers[0].id;
  }

  return {
    state: {
      workflowId: input.workflowId,
      workflowVersionId: input.workflowVersionId,
      currentNodeId,
      status: "running",
    },
    transition: transition({
      action: "start",
      fromNodeId: null,
      toNodeId: currentNodeId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
    }),
  };
}

export function startManualWorkflowInstanceState(input: {
  workflowId: number;
  workflowVersionId: number;
  graph: WorkflowInstanceGraph;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  return startWorkflowInstanceAtInitialTrigger({ ...input, triggerType: "trigger.manual" });
}

export function startEventWorkflowInstanceState(input: {
  workflowId: number;
  workflowVersionId: number;
  graph: WorkflowInstanceGraph;
  triggerNodeId: string;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  if (!input.triggerNodeId.trim()) {
    throw new Error("triggerNodeId é obrigatório para início por evento.");
  }
  return startWorkflowInstanceAtInitialTrigger({
    ...input,
    triggerType: "trigger.external_data",
  });
}

export function advanceWorkflowInstanceState(input: {
  state: WorkflowInstanceState;
  graph: WorkflowInstanceGraph;
  targetNodeId: string;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  assertMutableState(input.state);
  if (input.state.status === "waiting") {
    throw new Error("Instância waiting exige conclusão da tarefa antes de avançar.");
  }
  return moveToTarget(input);
}

export function resumeWaitingWorkflowInstanceState(input: {
  state: WorkflowInstanceState;
  graph: WorkflowInstanceGraph;
  targetNodeId?: string;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  assertMutableState(input.state);
  assertTransitionMetadata(input);
  assertGraph(input.graph);
  if (input.state.status !== "waiting") {
    throw new Error("Somente instância waiting pode ser retomada por conclusão de tarefa.");
  }

  const outgoing = input.graph.edges.filter(edge => edge.source === input.state.currentNodeId);
  if (!outgoing.length) {
    if (input.targetNodeId) {
      throw new Error("Etapa humana terminal não possui nó de destino.");
    }
    return {
      state: { ...input.state, status: "completed" },
      transition: transition({
        action: "complete",
        fromNodeId: input.state.currentNodeId,
        toNodeId: input.state.currentNodeId,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
      }),
    };
  }

  if (!input.targetNodeId) {
    throw new Error("targetNodeId é obrigatório para retomar etapa humana com saída.");
  }
  return moveToTarget({
    state: input.state,
    graph: input.graph,
    targetNodeId: input.targetNodeId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
  });
}

export function cancelWorkflowInstanceState(input: {
  state: WorkflowInstanceState;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  assertMutableState(input.state);
  assertTransitionMetadata(input);

  return {
    state: { ...input.state, status: "cancelled" },
    transition: transition({
      action: "cancel",
      fromNodeId: input.state.currentNodeId,
      toNodeId: input.state.currentNodeId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
    }),
  };
}

export function failWorkflowInstanceState(input: {
  state: WorkflowInstanceState;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  assertMutableState(input.state);
  assertTransitionMetadata(input);

  return {
    state: { ...input.state, status: "failed" },
    transition: transition({
      action: "fail",
      fromNodeId: input.state.currentNodeId,
      toNodeId: input.state.currentNodeId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
    }),
  };
}
