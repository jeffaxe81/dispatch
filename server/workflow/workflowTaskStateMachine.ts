export type WorkflowTaskStatus = "open" | "in_progress" | "completed" | "cancelled";

export type WorkflowTaskState = {
  executionId: number;
  workflowVersionId: number;
  nodeId: string;
  status: WorkflowTaskStatus;
  assigneeUserId: number | null;
};

type Meta = {
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
};

export type WorkflowTaskStateChange = {
  state: WorkflowTaskState;
  transition: {
    action: "create" | "claim" | "start" | "complete";
    fromStatus: WorkflowTaskStatus | null;
    toStatus: WorkflowTaskStatus;
    actorUserId: number;
    correlationId: string;
    occurredAt: string;
  };
};

function assertPositive(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} invalido.`);
}

function assertMeta(input: Meta) {
  assertPositive(input.actorUserId, "actorUserId");
  if (!input.correlationId.trim()) throw new Error("correlationId obrigatorio.");
  if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error("occurredAt invalido.");
}

function assertMutable(state: WorkflowTaskState) {
  if (state.status === "completed" || state.status === "cancelled") {
    throw new Error("Tarefa terminal nao pode sofrer nova transicao.");
  }
}

function result(state: WorkflowTaskState, action: WorkflowTaskStateChange["transition"]["action"], fromStatus: WorkflowTaskStatus | null, meta: Meta): WorkflowTaskStateChange {
  return {
    state,
    transition: {
      action,
      fromStatus,
      toStatus: state.status,
      actorUserId: meta.actorUserId,
      correlationId: meta.correlationId,
      occurredAt: meta.occurredAt,
    },
  };
}

export function createWorkflowTaskState(input: Meta & {
  executionId: number;
  workflowVersionId: number;
  nodeId: string;
  assigneeUserId?: number | null;
}): WorkflowTaskStateChange {
  assertMeta(input);
  assertPositive(input.executionId, "executionId");
  assertPositive(input.workflowVersionId, "workflowVersionId");
  if (!input.nodeId.trim()) throw new Error("nodeId obrigatorio.");
  if (input.assigneeUserId != null) assertPositive(input.assigneeUserId, "assigneeUserId");
  const state: WorkflowTaskState = {
    executionId: input.executionId,
    workflowVersionId: input.workflowVersionId,
    nodeId: input.nodeId.trim(),
    status: "open",
    assigneeUserId: input.assigneeUserId ?? null,
  };
  return result(state, "create", null, input);
}

export function claimWorkflowTaskState(input: Meta & { state: WorkflowTaskState }): WorkflowTaskStateChange {
  assertMeta(input);
  assertMutable(input.state);
  if (input.state.status !== "open" || input.state.assigneeUserId !== null) {
    throw new Error("claim exige tarefa open sem responsavel.");
  }
  const state: WorkflowTaskState = { ...input.state, status: "in_progress", assigneeUserId: input.actorUserId };
  return result(state, "claim", input.state.status, input);
}

export function startWorkflowTaskState(input: Meta & { state: WorkflowTaskState }): WorkflowTaskStateChange {
  assertMeta(input);
  assertMutable(input.state);
  if (input.state.status !== "open") throw new Error("Tarefa deve estar open.");
  if (input.state.assigneeUserId !== input.actorUserId) throw new Error("Usuario nao e o responsavel atual.");
  const state: WorkflowTaskState = { ...input.state, status: "in_progress" };
  return result(state, "start", input.state.status, input);
}

export function completeWorkflowTaskState(input: Meta & { state: WorkflowTaskState }): WorkflowTaskStateChange {
  assertMeta(input);
  assertMutable(input.state);
  if (input.state.status !== "in_progress") throw new Error("Tarefa deve estar in_progress.");
  if (input.state.assigneeUserId !== input.actorUserId) throw new Error("Usuario nao e o responsavel atual.");
  const state: WorkflowTaskState = { ...input.state, status: "completed" };
  return result(state, "complete", input.state.status, input);
}
