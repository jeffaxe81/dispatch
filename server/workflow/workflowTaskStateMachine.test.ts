import { describe, expect, it } from "vitest";
import {
  claimWorkflowTaskState,
  completeWorkflowTaskState,
  createWorkflowTaskState,
  startWorkflowTaskState,
} from "./workflowTaskStateMachine";

const meta = {
  correlationId: "corr-d012d-1",
  occurredAt: "2026-09-13T18:30:00.000Z",
};

describe("D-012D workflow task state machine", () => {
  it("creates an open task bound to execution, version and node", () => {
    const result = createWorkflowTaskState({
      executionId: 50,
      workflowVersionId: 101,
      nodeId: "task-1",
      assigneeUserId: 11,
      actorUserId: 7,
      ...meta,
    });
    expect(result.state).toEqual({
      executionId: 50,
      workflowVersionId: 101,
      nodeId: "task-1",
      status: "open",
      assigneeUserId: 11,
    });
  });

  it("claim is allowed only for an open unassigned task", () => {
    const open = createWorkflowTaskState({
      executionId: 50,
      workflowVersionId: 101,
      nodeId: "task-1",
      assigneeUserId: null,
      actorUserId: 7,
      ...meta,
    });
    const claimed = claimWorkflowTaskState({ state: open.state, actorUserId: 11, ...meta });
    expect(claimed.state).toMatchObject({ status: "in_progress", assigneeUserId: 11 });
    expect(() => claimWorkflowTaskState({ state: claimed.state, actorUserId: 12, ...meta })).toThrow();
  });

  it("start and complete require the current assignee", () => {
    const open = createWorkflowTaskState({
      executionId: 50,
      workflowVersionId: 101,
      nodeId: "task-1",
      assigneeUserId: 11,
      actorUserId: 7,
      ...meta,
    });
    expect(() => startWorkflowTaskState({ state: open.state, actorUserId: 12, ...meta })).toThrow();
    const started = startWorkflowTaskState({ state: open.state, actorUserId: 11, ...meta });
    const completed = completeWorkflowTaskState({ state: started.state, actorUserId: 11, ...meta });
    expect(completed.state.status).toBe("completed");
  });
});
