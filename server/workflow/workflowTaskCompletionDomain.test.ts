import { describe, expect, it } from "vitest";
import {
  completeWaitingWorkflowInstanceState,
  type WorkflowInstanceGraph,
  type WorkflowInstanceState,
} from "./workflowInstanceStateMachine";
import { resolveHumanTaskCompletionTarget } from "./workflowTaskDomain";

const graph = (targets: string[]): WorkflowInstanceGraph => ({
  nodes: [
    { id: "task-1", type: "task.human" },
    ...targets.map(id => ({ id, type: id.startsWith("task") ? "task.human" : "notification.simulate" })),
  ],
  edges: targets.map((target, index) => ({ id: `e-${index + 1}`, source: "task-1", target })),
});

const waitingState: WorkflowInstanceState = {
  workflowId: 1,
  workflowVersionId: 101,
  currentNodeId: "task-1",
  status: "waiting",
};

describe("D-012D resolução de conclusão humana", () => {
  it("conclui a instância quando a tarefa humana não possui saída", () => {
    expect(resolveHumanTaskCompletionTarget(graph([]), "task-1")).toBeNull();

    const result = completeWaitingWorkflowInstanceState({
      state: waitingState,
      actorUserId: 7,
      correlationId: "corr-terminal-task",
      occurredAt: "2026-09-13T18:30:00.000Z",
    });

    expect(result.state).toEqual({ ...waitingState, status: "completed" });
    expect(result.transition).toMatchObject({
      action: "complete",
      fromNodeId: "task-1",
      toNodeId: "task-1",
      actorUserId: 7,
    });
  });

  it("seleciona automaticamente a única saída", () => {
    expect(resolveHumanTaskCompletionTarget(graph(["notify-1"]), "task-1")).toBe("notify-1");
  });

  it("exige escolha quando existem múltiplas saídas e rejeita alvo fora das arestas", () => {
    const branching = graph(["notify-a", "notify-b"]);
    expect(() => resolveHumanTaskCompletionTarget(branching, "task-1")).toThrow("targetNodeId");
    expect(resolveHumanTaskCompletionTarget(branching, "task-1", "notify-b")).toBe("notify-b");
    expect(() => resolveHumanTaskCompletionTarget(branching, "task-1", "other")).toThrow("saída válida");
  });

  it("não permite conclusão terminal a partir de estado diferente de waiting", () => {
    expect(() => completeWaitingWorkflowInstanceState({
      state: { ...waitingState, status: "running" },
      actorUserId: 7,
      correlationId: "corr-invalid-terminal",
      occurredAt: "2026-09-13T18:30:00.000Z",
    })).toThrow("waiting");
  });
});
