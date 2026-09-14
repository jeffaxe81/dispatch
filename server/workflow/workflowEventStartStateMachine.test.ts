import { describe, expect, it } from "vitest";

const stateMachineModulePath = "./workflowInstanceStateMachine";
const loadStateMachine = () => import(stateMachineModulePath);

const graph = {
  nodes: [
    { id: "trigger-event", type: "trigger.external_data" },
    { id: "notify-1", type: "notification.simulate" },
  ],
  edges: [{ id: "edge-1", source: "trigger-event", target: "notify-1" }],
};

describe("D-012F event-triggered workflow instance start", () => {
  it("inicia pela trigger externa inicial explicitamente selecionada preservando correlationId", async () => {
    const { startWorkflowInstanceState } = await loadStateMachine();
    const result = startWorkflowInstanceState({
      workflowId: 10,
      workflowVersionId: 101,
      graph,
      triggerNodeId: "trigger-event",
      actorUserId: 7,
      correlationId: "corr-event-start-0001",
      occurredAt: "2026-09-13T20:30:00.000Z",
    });

    expect(result.state).toEqual({
      workflowId: 10,
      workflowVersionId: 101,
      currentNodeId: "trigger-event",
      status: "running",
    });
    expect(result.transition).toMatchObject({
      action: "start",
      fromNodeId: null,
      toNodeId: "trigger-event",
      correlationId: "corr-event-start-0001",
    });
  });

  it("falha fechado se o nó selecionado não for trigger inicial", async () => {
    const { startWorkflowInstanceState } = await loadStateMachine();

    expect(() => startWorkflowInstanceState({
      workflowId: 10,
      workflowVersionId: 101,
      graph,
      triggerNodeId: "notify-1",
      actorUserId: 7,
      correlationId: "corr-event-start-0002",
      occurredAt: "2026-09-13T20:31:00.000Z",
    })).toThrow();

    expect(() => startWorkflowInstanceState({
      workflowId: 10,
      workflowVersionId: 101,
      graph: {
        nodes: [
          { id: "pre", type: "trigger.manual" },
          { id: "trigger-event", type: "trigger.external_data" },
        ],
        edges: [{ id: "edge-in", source: "pre", target: "trigger-event" }],
      },
      triggerNodeId: "trigger-event",
      actorUserId: 7,
      correlationId: "corr-event-start-0003",
      occurredAt: "2026-09-13T20:32:00.000Z",
    })).toThrow();
  });
});
