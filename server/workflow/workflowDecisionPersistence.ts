import {
  resolveWorkflowDecisionState,
  type WorkflowInstanceGraph,
  type WorkflowInstanceState,
  type WorkflowInstanceStateChange,
} from "./workflowInstanceStateMachine";
import type { WorkflowConditionContext } from "./workflowConditionEvaluator";

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} deve ser um objeto persistido válido.`);
  }
  return value as Record<string, unknown>;
}

export function buildWorkflowDecisionContextFromExecutionInput(
  inputData: unknown,
): WorkflowConditionContext {
  const input = asRecord(inputData, "inputData");
  const fields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (["simulation", "eventId", "eventType", "producer", "payload"].includes(key)) continue;
    fields[`input.${key}`] = value;
  }

  if (input.payload !== undefined) {
    const payload = asRecord(input.payload, "inputData.payload");
    for (const [key, value] of Object.entries(payload)) {
      fields[`event.${key}`] = value;
    }
  }

  for (const key of ["eventId", "eventType", "producer"] as const) {
    const value = input[key];
    if (value !== undefined) fields[`meta.${key}`] = value;
  }

  return {
    fields,
    exposedFields: new Set(Object.keys(fields)),
  };
}

export function resolveWorkflowDecisionFromExecutionInput(input: {
  state: WorkflowInstanceState;
  graph: WorkflowInstanceGraph;
  inputData: unknown;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  return resolveWorkflowDecisionState({
    state: input.state,
    graph: input.graph,
    context: buildWorkflowDecisionContextFromExecutionInput(input.inputData),
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
  });
}
