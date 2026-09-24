import { describe, expect, it } from "vitest";
import {
  startEventWorkflowInstanceState,
  type WorkflowInstanceGraph,
} from "./workflowInstanceStateMachine";

const graph: WorkflowInstanceGraph = {
  nodes: [
    { id: "event-trigger-1", type: "trigger.external_data" },
    { id: "notify-event", type: "notification.simulate" },
  ],
  edges: [{ id: "edge-event", source: "event-trigger-1", target: "notify-event" }],
};

describe("D-012F event-triggered workflow state", () => {
  it("inicia somente no trigger.external_data inicial selecionado", () => {
    const result = startEventWorkflowInstanceState({
      workflowId: 10,
      workflowVersionId: 102,
      graph,
      triggerNodeId: "event-trigger-1",
      actorUserId: 7,
      correlationId: "corr-d012f-event-1",
      occurredAt: "2026-09-13T16:30:00.000Z",
    });

    expect(result.state).toEqual({
      workflowId: 10,
      workflowVersionId: 102,
      currentNodeId: "event-trigger-1",
      status: "running",
    });
    expect(result.transition).toMatchObject({
      action: "start",
      fromNodeId: null,
      toNodeId: "event-trigger-1",
      correlationId: "corr-d012f-event-1",
    });
  });

  it("falha fechado quando o nó selecionado não é trigger.external_data inicial", () => {
    expect(() => startEventWorkflowInstanceState({
      workflowId: 10,
      workflowVersionId: 102,
      graph,
      triggerNodeId: "notify-event",
      actorUserId: 7,
      correlationId: "corr-d012f-event-2",
      occurredAt: "2026-09-13T16:30:00.000Z",
    })).toThrow("trigger.external_data inicial");
  });
});