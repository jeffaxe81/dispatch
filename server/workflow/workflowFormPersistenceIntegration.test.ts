import { describe, expect, it } from "vitest";
import { toWorkflowInstanceGraph } from "./workflowInstancePersistence";
import { findWorkflowFormEventTargetNodeId } from "./workflowEventTriggerPersistence";
import { writeWorkflowFormEvidence } from "./workflowFormEventEvidence";

function definition(policy: "optional" | "required_before_task_completion" | "required_before_transition") {
  return {
    nodes: [
      {
        id: "form-1",
        type: "form.d008",
        configuration: { formId: 10, formVersionId: 25, policy },
      },
      { id: "end-1", type: "trail.end", configuration: {} },
    ],
    edges: [{ id: "form-end", source: "form-1", target: "end-1" }],
  };
}

describe("D-012H H4 — runtime persistente do form.d008", () => {
  it("congela a referência D-008 no grafo da instância", () => {
    const graph = toWorkflowInstanceGraph(definition("required_before_transition"));
    expect(graph.nodes[0]).toMatchObject({
      id: "form-1",
      type: "form.d008",
      formRequirement: {
        formId: 10,
        formVersionId: 25,
        policy: "required_before_transition",
      },
    });
  });

  it("transforma required_before_task_completion em tarefa humana implícita", () => {
    const graph = toWorkflowInstanceGraph(definition("required_before_task_completion"));
    expect(graph.nodes[0]).toMatchObject({
      requiresHumanTask: true,
      formRequirement: {
        formId: 10,
        formVersionId: 25,
        policy: "required_before_task_completion",
      },
    });
  });

  it("correlaciona evento somente com form/version congelados e uma saída inequívoca", () => {
    expect(findWorkflowFormEventTargetNodeId(
      definition("required_before_transition"),
      "form-1",
      "form.submission.submitted.v1",
      { submissionId: 44, formId: 10, formVersionId: 25 },
    )).toBe("end-1");

    expect(findWorkflowFormEventTargetNodeId(
      definition("required_before_transition"),
      "form-1",
      "form.submission.corrected.v1",
      { submissionId: 44, formId: 10, formVersionId: 99 },
    )).toBeNull();
  });

  it("não trata evento não-D008 como evidência do formulário", () => {
    expect(findWorkflowFormEventTargetNodeId(
      definition("required_before_transition"),
      "form-1",
      "incident.created.v1",
      { submissionId: 44, formId: 10, formVersionId: 25 },
    )).toBeNull();
  });

  it("retoma required_before_transition usando a evidência persistida", async () => {
    const module = await import("./workflowFormPersistence");
    const resolver = (module as unknown as {
      resolveWorkflowFormStepFromExecutionOutput?: (input: Record<string, unknown>) => {
        state: { status: string; currentNodeId: string };
      };
    }).resolveWorkflowFormStepFromExecutionOutput;
    expect(typeof resolver).toBe("function");

    const graph = toWorkflowInstanceGraph(definition("required_before_transition"));
    const outputData = writeWorkflowFormEvidence({}, "form-1", {
      submissionId: 44,
      formId: 10,
      formVersionId: 25,
      status: "submitted",
    });

    const result = resolver!({
      state: {
        workflowId: 1,
        workflowVersionId: 101,
        currentNodeId: "form-1",
        status: "waiting",
      },
      graph,
      outputData,
      targetNodeId: "end-1",
      actorUserId: 7,
      correlationId: "corr-form-resume-0001",
      occurredAt: "2026-09-27T12:20:00-03:00",
    });

    expect(result.state).toMatchObject({
      currentNodeId: "end-1",
      status: "completed",
    });
  });

  it("falha fechado ao tentar retomar sem evidência persistida", async () => {
    const module = await import("./workflowFormPersistence");
    const resolver = (module as unknown as {
      resolveWorkflowFormStepFromExecutionOutput?: (input: Record<string, unknown>) => unknown;
    }).resolveWorkflowFormStepFromExecutionOutput;
    expect(typeof resolver).toBe("function");

    const graph = toWorkflowInstanceGraph(definition("required_before_transition"));
    expect(() => resolver!({
      state: {
        workflowId: 1,
        workflowVersionId: 101,
        currentNodeId: "form-1",
        status: "waiting",
      },
      graph,
      outputData: null,
      targetNodeId: "end-1",
      actorUserId: 7,
      correlationId: "corr-form-resume-0002",
      occurredAt: "2026-09-27T12:21:00-03:00",
    })).toThrow(/formulário|submissão|D-008|obrigat/i);
  });
});
