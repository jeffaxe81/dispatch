import { describe, expect, it } from "vitest";
import {
  advanceWorkflowInstanceState,
  cancelWorkflowInstanceState,
  failWorkflowInstanceState,
  resumeWaitingWorkflowInstanceState,
  startManualWorkflowInstanceState,
  type WorkflowInstanceGraph,
} from "./workflowInstanceStateMachine";

const occurredAt = "2026-09-13T16:30:00.000Z";
const actorUserId = 7;
const correlationId = "corr-d012c-0001";

const graph: WorkflowInstanceGraph = {
  nodes: [
    { id: "trigger-1", type: "trigger.manual" },
    { id: "notify-1", type: "notification.simulate" },
  ],
  edges: [{ id: "edge-1", source: "trigger-1", target: "notify-1" }],
};

const humanTaskGraph: WorkflowInstanceGraph = {
  nodes: [
    { id: "trigger-1", type: "trigger.manual" },
    { id: "human-1", type: "notification.simulate", requiresHumanTask: true, assigneeUserId: 11 },
    { id: "notify-2", type: "notification.simulate" },
  ],
  edges: [
    { id: "edge-1", source: "trigger-1", target: "human-1" },
    { id: "edge-2", source: "human-1", target: "notify-2" },
  ],
};

const terminalHumanTaskGraph: WorkflowInstanceGraph = {
  nodes: [
    { id: "trigger-1", type: "trigger.manual" },
    { id: "human-end", type: "notification.simulate", requiresHumanTask: true, assigneeUserId: 11 },
  ],
  edges: [{ id: "edge-1", source: "trigger-1", target: "human-end" }],
};

function start() {
  return startManualWorkflowInstanceState({ workflowId: 10, workflowVersionId: 101, graph, actorUserId, correlationId, occurredAt });
}

function startHumanTaskGraph() {
  return startManualWorkflowInstanceState({ workflowId: 10, workflowVersionId: 101, graph: humanTaskGraph, actorUserId, correlationId, occurredAt });
}

describe("D-012C/D workflow instance state machine", () => {
  it("inicia manualmente na versão publicada congelada e no único trigger manual", () => {
    const result = start();
    expect(result.state).toEqual({ workflowId: 10, workflowVersionId: 101, currentNodeId: "trigger-1", status: "running" });
    expect(result.transition).toEqual({ action: "start", fromNodeId: null, toNodeId: "trigger-1", actorUserId, correlationId, occurredAt });
  });

  it("falha fechado quando não existe exatamente um trigger manual inicial", () => {
    expect(() => startManualWorkflowInstanceState({
      workflowId: 10,
      workflowVersionId: 101,
      graph: { nodes: [{ id: "notify-1", type: "notification.simulate" }], edges: [] },
      actorUserId,
      correlationId,
      occurredAt,
    })).toThrow("exatamente um trigger.manual inicial");

    expect(() => startManualWorkflowInstanceState({
      workflowId: 10,
      workflowVersionId: 101,
      graph: { nodes: [{ id: "trigger-1", type: "trigger.manual" }, { id: "trigger-2", type: "trigger.manual" }], edges: [] },
      actorUserId,
      correlationId,
      occurredAt,
    })).toThrow("exatamente um trigger.manual inicial");
  });

  it("aceita somente transição ligada ao currentNodeId e conclui ao alcançar nó terminal", () => {
    const initial = start();
    const advanced = advanceWorkflowInstanceState({
      state: initial.state,
      graph,
      targetNodeId: "notify-1",
      actorUserId,
      correlationId: "corr-d012c-0002",
      occurredAt: "2026-09-13T16:31:00.000Z",
    });
    expect(advanced.state).toEqual({ ...initial.state, currentNodeId: "notify-1", status: "completed" });
    expect(advanced.transition.action).toBe("complete");
  });

  it("entra em waiting ao alcançar etapa marcada como humana e bloqueia avanço direto", () => {
    const initial = startHumanTaskGraph();
    const waiting = advanceWorkflowInstanceState({ state: initial.state, graph: humanTaskGraph, targetNodeId: "human-1", actorUserId, correlationId: "corr-d012d-wait", occurredAt });
    expect(waiting.state).toEqual({ ...initial.state, currentNodeId: "human-1", status: "waiting" });
    expect(waiting.transition.action).toBe("advance");
    expect(() => advanceWorkflowInstanceState({ state: waiting.state, graph: humanTaskGraph, targetNodeId: "notify-2", actorUserId, correlationId: "corr-d012d-blocked", occurredAt })).toThrow("waiting");
  });

  it("retoma uma instância waiting somente pela aresta válida da versão congelada", () => {
    const initial = startHumanTaskGraph();
    const waiting = advanceWorkflowInstanceState({ state: initial.state, graph: humanTaskGraph, targetNodeId: "human-1", actorUserId, correlationId, occurredAt });
    const resumed = resumeWaitingWorkflowInstanceState({ state: waiting.state, graph: humanTaskGraph, targetNodeId: "notify-2", actorUserId: 11, correlationId: "corr-d012d-resume", occurredAt });
    expect(resumed.state).toEqual({ ...waiting.state, currentNodeId: "notify-2", status: "completed" });
    expect(resumed.transition.action).toBe("complete");
  });

  it("conclui a instância ao completar uma etapa humana terminal", () => {
    const initial = startManualWorkflowInstanceState({ workflowId: 10, workflowVersionId: 101, graph: terminalHumanTaskGraph, actorUserId, correlationId, occurredAt });
    const waiting = advanceWorkflowInstanceState({ state: initial.state, graph: terminalHumanTaskGraph, targetNodeId: "human-end", actorUserId, correlationId, occurredAt });
    const completed = resumeWaitingWorkflowInstanceState({ state: waiting.state, graph: terminalHumanTaskGraph, actorUserId: 11, correlationId: "corr-d012d-terminal", occurredAt });
    expect(completed.state).toEqual({ ...waiting.state, status: "completed" });
    expect(completed.transition).toMatchObject({ action: "complete", fromNodeId: "human-end", toNodeId: "human-end" });
  });

  it("rejeita alvo sem aresta a partir do nó corrente sem mutar o estado original", () => {
    const initial = start();
    const original = structuredClone(initial.state);
    expect(() => advanceWorkflowInstanceState({
      state: initial.state,
      graph: { nodes: [...graph.nodes, { id: "other-1", type: "notification.simulate" }], edges: graph.edges },
      targetNodeId: "other-1",
      actorUserId,
      correlationId,
      occurredAt,
    })).toThrow("Transição não permitida");
    expect(initial.state).toEqual(original);
  });

  it("não permite avançar uma instância terminal", () => {
    const initial = start();
    const completed = advanceWorkflowInstanceState({ state: initial.state, graph, targetNodeId: "notify-1", actorUserId, correlationId, occurredAt });
    expect(() => advanceWorkflowInstanceState({ state: completed.state, graph, targetNodeId: "notify-1", actorUserId, correlationId, occurredAt })).toThrow("Instância terminal");
  });

  it("cancela somente instância running ou waiting preservando o último nó", () => {
    const initial = start();
    const cancelled = cancelWorkflowInstanceState({ state: initial.state, actorUserId, correlationId: "corr-d012c-cancel", occurredAt });
    expect(cancelled.state).toEqual({ ...initial.state, status: "cancelled" });
    expect(cancelled.transition).toMatchObject({ action: "cancel", fromNodeId: "trigger-1", toNodeId: "trigger-1", correlationId: "corr-d012c-cancel" });
    expect(() => cancelWorkflowInstanceState({ state: cancelled.state, actorUserId, correlationId, occurredAt })).toThrow("Instância terminal");
  });

  it("marca falha controlada e mantém metadados auditáveis fornecidos pelo chamador", () => {
    const initial = start();
    const failed = failWorkflowInstanceState({ state: initial.state, actorUserId: 11, correlationId: "corr-d012c-failure", occurredAt: "2026-09-13T16:32:00.000Z" });
    expect(failed.state.status).toBe("failed");
    expect(failed.transition).toEqual({ action: "fail", fromNodeId: "trigger-1", toNodeId: "trigger-1", actorUserId: 11, correlationId: "corr-d012c-failure", occurredAt: "2026-09-13T16:32:00.000Z" });
  });
});
