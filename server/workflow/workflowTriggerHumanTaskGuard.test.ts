import { describe, expect, it } from "vitest";
import { startManualWorkflowInstanceState } from "./workflowInstanceStateMachine";

describe("D-012D human task trigger guard", () => {
  it("rejeita trigger marcado como tarefa humana", () => {
    expect(() => startManualWorkflowInstanceState({
      workflowId: 10,
      workflowVersionId: 101,
      graph: {
        nodes: [{ id: "trigger-1", type: "trigger.manual", requiresHumanTask: true }],
        edges: [],
      },
      actorUserId: 7,
      correlationId: "corr-d012d-trigger-guard",
      occurredAt: "2026-09-13T16:30:00.000Z",
    })).toThrow("trigger");
  });
});
