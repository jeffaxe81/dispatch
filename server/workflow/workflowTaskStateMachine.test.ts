import { describe, expect, it } from "vitest";
import {
  assignWorkflowTaskState,
  cancelWorkflowTaskState,
  claimWorkflowTaskState,
  completeWorkflowTaskState,
  createWorkflowTaskState,
  startWorkflowTaskState,
} from "./workflowTaskStateMachine";

const meta = {
  correlationId: "corr-d012d-1",
  occurredAt: "2026-09-13T18:30:00.000Z",
};

function openTask(assigneeUserId: number | null = null) {
  return createWorkflowTaskState({
    executionId: 50,
    workflowVersionId: 101,
    nodeId: "task-1",
    assigneeUserId,
    actorUserId: 7,
    ...meta,
  });
}

describe("D-012D workflow task state machine", () => {
  it("creates an open task bound to execution, version and node", () => {
    const result = openTask(11);
    expect(result.state).toEqual({
      executionId: 50,
      workflowVersionId: 101,
      nodeId: "task-1",
      status: "open",
      assigneeUserId: 11,
    });
  });

  it("assigns and reassigns a non-terminal task without changing status", () => {
    const assigned = assignWorkflowTaskState({ state: openTask().state, assigneeUserId: 11, actorUserId: 7, ...meta });
    const reassigned = assignWorkflowTaskState({ state: assigned.state, assigneeUserId: 12, actorUserId: 7, ...meta });
    expect(assigned.state).toMatchObject({ status: "open", assigneeUserId: 11 });
    expect(reassigned.state).toMatchObject({ status: "open", assigneeUserId: 12 });
  });

  it("claim is allowed only for an open unassigned task", () => {
    const claimed = claimWorkflowTaskState({ state: openTask().state, actorUserId: 11, ...meta });
    expect(claimed.state).toMatchObject({ status: "in_progress", assigneeUserId: 11 });
    expect(() => claimWorkflowTaskState({ state: claimed.state, actorUserId: 12, ...meta })).toThrow();
  });

  it("start and complete require the current assignee", () => {
    const open = openTask(11);
    expect(() => startWorkflowTaskState({ state: open.state, actorUserId: 12, ...meta })).toThrow();
    const started = startWorkflowTaskState({ state: open.state, actorUserId: 11, ...meta });
    const completed = completeWorkflowTaskState({ state: started.state, actorUserId: 11, ...meta });
    expect(completed.state.status).toBe("completed");
    expect(() => cancelWorkflowTaskState({ state: completed.state, actorUserId: 7, ...meta })).toThrow();
  });

  it("cancels a non-terminal task", () => {
    const cancelled = cancelWorkflowTaskState({ state: openTask(11).state, actorUserId: 7, ...meta });
    expect(cancelled.state.status).toBe("cancelled");
  });
});
