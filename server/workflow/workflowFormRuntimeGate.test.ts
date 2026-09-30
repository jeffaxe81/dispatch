import { describe, expect, it } from "vitest";
import {
  advanceWorkflowInstanceState,
  resumeWaitingWorkflowInstanceState,
  type WorkflowInstanceGraph,
} from "./workflowInstanceStateMachine";
import { completeWorkflowTaskState } from "./workflowTaskStateMachine";

const requiredBeforeTask = {
  formId: 10,
  formVersionId: 25,
  policy: "required_before_task_completion",
} as const;

const requiredBeforeTransition = {
  formId: 10,
  formVersionId: 25,
  policy: "required_before_transition",
} as const;

const submittedEvidence = {
  submissionId: 44,
  formId: 10,
  formVersionId: 25,
  status: "submitted",
} as const;

function graph(requirement = requiredBeforeTransition): WorkflowInstanceGraph {
  return {
    nodes: [
      { id: "trigger-1", type: "trigger.manual" },
      {
        id: "form-1",
        type: "form.d008",
        formRequirement: requirement,
      },
      { id: "end-1", type: "trail.end" },
    ] as WorkflowInstanceGraph["nodes"],
    edges: [
      { source: "trigger-1", target: "form-1" },
      { source: "form-1", target: "end-1" },
    ],
  };
}

const meta = {
  actorUserId: 7,
  correlationId: "corr-d012h-h3",
  occurredAt: "2026-09-27T12:00:00-03:00",
};

describe("D-012H H3 — gates de formulário na tarefa e transição", () => {
  it("coloca form.d008 em waiting ao entrar na etapa", () => {
    const result = advanceWorkflowInstanceState({
      state: {
        workflowId: 1,
        workflowVersionId: 101,
        currentNodeId: "trigger-1",
        status: "running",
      },
      graph: graph(),
      targetNodeId: "form-1",
      ...meta,
    });

    expect(result.state.status).toBe("waiting");
    expect(result.state.currentNodeId).toBe("form-1");
  });

  it("bloqueia transição obrigatória sem evidência válida e libera com submitted", () => {
    const input = {
      state: {
        workflowId: 1,
        workflowVersionId: 101,
        currentNodeId: "form-1",
        status: "waiting" as const,
      },
      graph: graph(requiredBeforeTransition),
      targetNodeId: "end-1",
      ...meta,
    };

    expect(() => (resumeWaitingWorkflowInstanceState as any)(input))
      .toThrow(/formulário|submissão|D-008|obrigat/i);

    const result = (resumeWaitingWorkflowInstanceState as any)({
      ...input,
      formSubmissionEvidence: submittedEvidence,
    });
    expect(result.state.status).toBe("completed");
  });

  it("bloqueia conclusão da tarefa quando a política exige formulário antes da conclusão", () => {
    const task = {
      executionId: 1,
      workflowVersionId: 101,
      nodeId: "form-1",
      status: "in_progress" as const,
      assigneeUserId: 7,
    };

    expect(() => (completeWorkflowTaskState as any)({
      state: task,
      formRequirement: requiredBeforeTask,
      formSubmissionEvidence: null,
      ...meta,
    })).toThrow(/formulário|submissão|D-008|obrigat/i);

    const completed = (completeWorkflowTaskState as any)({
      state: task,
      formRequirement: requiredBeforeTask,
      formSubmissionEvidence: submittedEvidence,
      ...meta,
    });
    expect(completed.state.status).toBe("completed");
  });

  it("required_before_transition não bloqueia a conclusão da tarefa; o gate é da transição", () => {
    const completed = (completeWorkflowTaskState as any)({
      state: {
        executionId: 1,
        workflowVersionId: 101,
        nodeId: "form-1",
        status: "in_progress",
        assigneeUserId: 7,
      },
      formRequirement: requiredBeforeTransition,
      formSubmissionEvidence: null,
      ...meta,
    });

    expect(completed.state.status).toBe("completed");
  });

  it("política optional permite retomar a etapa sem submissão", () => {
    const result = (resumeWaitingWorkflowInstanceState as any)({
      state: {
        workflowId: 1,
        workflowVersionId: 101,
        currentNodeId: "form-1",
        status: "waiting",
      },
      graph: graph({
        formId: 10,
        formVersionId: 25,
        policy: "optional",
      }),
      targetNodeId: "end-1",
      formSubmissionEvidence: null,
      ...meta,
    });

    expect(result.state.status).toBe("completed");
  });
});
