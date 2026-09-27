import {
  resolveWorkflowDecisionState,
  type WorkflowInstanceGraph,
  type WorkflowInstanceState,
  type WorkflowInstanceStateChange,
} from "./workflowInstanceStateMachine";
import type { WorkflowConditionContext } from "./workflowConditionEvaluator";

export const MAX_WORKFLOW_DECISION_CONTEXT_FIELDS = 200;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} deve ser um objeto persistido válido.`);
  }
  return value as Record<string, unknown>;
}

function requireMetadataString(
  input: Record<string, unknown>,
  key: "eventId" | "eventType" | "producer",
): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Metadado de evento ${key} inválido no inputData persistido.`);
  }
  return value.trim();
}

function assertContextFieldLimit(fields: Record<string, unknown>) {
  if (Object.keys(fields).length > MAX_WORKFLOW_DECISION_CONTEXT_FIELDS) {
    throw new Error("Quantidade de campos expostos excede o limite do contexto de decisão.");
  }
}

export function buildWorkflowDecisionContextFromExecutionInput(
  inputData: unknown,
  triggerType: string,
): WorkflowConditionContext {
  const input = asRecord(inputData, "inputData");
  const fields: Record<string, unknown> = {};

  if (triggerType === "manual") {
    for (const [key, value] of Object.entries(input)) {
      if (key === "simulation") continue;
      fields[`input.${key}`] = value;
    }
  } else if (triggerType.startsWith("event:")) {
    for (const [key, value] of Object.entries(input)) {
      if (["simulation", "eventId", "eventType", "producer", "payload"].includes(key)) continue;
      fields[`input.${key}`] = value;
    }

    const payload = asRecord(input.payload, "inputData.payload");
    for (const [key, value] of Object.entries(payload)) {
      fields[`event.${key}`] = value;
    }

    for (const key of ["eventId", "eventType", "producer"] as const) {
      fields[`meta.${key}`] = requireMetadataString(input, key);
    }
  } else {
    throw new Error(`triggerType de workflow não suportado para decisão: ${triggerType || "(vazio)"}.`);
  }

  assertContextFieldLimit(fields);
  return {
    fields,
    exposedFields: new Set(Object.keys(fields)),
  };
}

export function resolveWorkflowDecisionFromExecutionInput(input: {
  state: WorkflowInstanceState;
  graph: WorkflowInstanceGraph;
  inputData: unknown;
  triggerType: string;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}): WorkflowInstanceStateChange {
  return resolveWorkflowDecisionState({
    state: input.state,
    graph: input.graph,
    context: buildWorkflowDecisionContextFromExecutionInput(input.inputData, input.triggerType),
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
  });
}
