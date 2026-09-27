import { describe, expect, it } from "vitest";
import {
  resolveWorkflowDecisionState,
  type WorkflowInstanceGraph,
  type WorkflowInstanceState,
} from "./workflowInstanceStateMachine";

const state: WorkflowInstanceState = {
  workflowId: 10,
  workflowVersionId: 101,
  currentNodeId: "decision-1",
  status: "running",
};

const graph: WorkflowInstanceGraph = {
  nodes: [
    {
      id: "decision-1",
      type: "decision.condition",
      decision: {
        condition: { field: "input.priority", operator: "eq", value: "alta" },
        trueTargetNodeId: "high",
        falseTargetNodeId: "normal",
      },
    },
    { id: "high", type: "notification.simulate" },
    { id: "normal", type: "notification.simulate" },
  ],
  edges: [
    { id: "true", source: "decision-1", target: "high" },
    { id: "false", source: "decision-1", target: "normal" },
  ],
};

const metadata = {
  actorUserId: 7,
  correlationId: "corr-d012g-g3",
  occurredAt: "2026-09-27T10:30:00.000Z",
};

describe("D-012G G3 — decisão na máquina de estados", () => {
  it("segue somente o destino verdadeiro da versão congelada quando a condição é verdadeira", () => {
    const result = resolveWorkflowDecisionState({
      state,
      graph,
      context: {
        fields: { "input.priority": "alta" },
        exposedFields: new Set(["input.priority"]),
      },
      ...metadata,
    });

    expect(result.state.currentNodeId).toBe("high");
    expect(result.state.status).toBe("completed");
    expect(result.transition).toMatchObject({
      fromNodeId: "decision-1",
      toNodeId: "high",
      correlationId: metadata.correlationId,
    });
  });

  it("segue somente o destino falso quando a condição é falsa", () => {
    const result = resolveWorkflowDecisionState({
      state,
      graph,
      context: {
        fields: { "input.priority": "baixa" },
        exposedFields: new Set(["input.priority"]),
      },
      ...metadata,
    });

    expect(result.state.currentNodeId).toBe("normal");
  });

  it("falha fechado para campo não exposto", () => {
    expect(() => resolveWorkflowDecisionState({
      state,
      graph,
      context: {
        fields: { "input.priority": "alta" },
        exposedFields: new Set(),
      },
      ...metadata,
    })).toThrow(/exposto|campo/i);
  });

  it("falha fechado se a configuração congelada divergir das arestas", () => {
    const invalidGraph: WorkflowInstanceGraph = {
      ...graph,
      edges: [
        { id: "true", source: "decision-1", target: "high" },
        { id: "wrong", source: "decision-1", target: "other" },
      ],
      nodes: [...graph.nodes, { id: "other", type: "notification.simulate" }],
    };

    expect(() => resolveWorkflowDecisionState({
      state,
      graph: invalidGraph,
      context: {
        fields: { "input.priority": "alta" },
        exposedFields: new Set(["input.priority"]),
      },
      ...metadata,
    })).toThrow(/destino|saída|congelada|decisão/i);
  });

  it("não permite resolver decisão quando o nó atual não é decision.condition", () => {
    expect(() => resolveWorkflowDecisionState({
      state: { ...state, currentNodeId: "high" },
      graph,
      context: {
        fields: { "input.priority": "alta" },
        exposedFields: new Set(["input.priority"]),
      },
      ...metadata,
    })).toThrow(/decision\.condition|decisão/i);
  });
});
