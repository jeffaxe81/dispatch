import { describe, expect, it } from "vitest";
import { advanceWorkflowInstanceState, type WorkflowInstanceGraph } from "./workflowInstanceStateMachine";
import { parseHumanTaskAssignment } from "./workflowTaskDomain";

const metadata = {
  actorUserId: 7,
  correlationId: "corr-d012d-domain",
  occurredAt: "2026-09-13T18:00:00.000Z",
};

describe("D-012D human task domain", () => {
  it("aceita exatamente um responsável por usuário, equipe ou papel", () => {
    expect(parseHumanTaskAssignment({ assignmentType: "user", assigneeUserId: 10 })).toEqual({
      type: "user",
      userId: 10,
      teamId: null,
      role: null,
    });
    expect(parseHumanTaskAssignment({ assignmentType: "team", assigneeTeamId: 20 })).toEqual({
      type: "team",
      userId: null,
      teamId: 20,
      role: null,
    });
    expect(parseHumanTaskAssignment({ assignmentType: "role", assigneeRole: "despachador" })).toEqual({
      type: "role",
      userId: null,
      teamId: null,
      role: "despachador",
    });
  });

  it("falha fechado para atribuição ausente, múltipla ou inválida", () => {
    expect(() => parseHumanTaskAssignment({ assignmentType: "user" })).toThrow("assigneeUserId");
    expect(() => parseHumanTaskAssignment({ assignmentType: "team", assigneeTeamId: 0 })).toThrow("assigneeTeamId");
    expect(() => parseHumanTaskAssignment({ assignmentType: "role", assigneeRole: "" })).toThrow("assigneeRole");
    expect(() => parseHumanTaskAssignment({ assignmentType: "user", assigneeUserId: 10, assigneeTeamId: 20 })).toThrow("exatamente um responsável");
    expect(() => parseHumanTaskAssignment({ assignmentType: "external", assigneeRole: "operador" })).toThrow("assignmentType");
  });

  it("coloca a instância em waiting ao entrar em task.human, mesmo quando há saída", () => {
    const graph: WorkflowInstanceGraph = {
      nodes: [
        { id: "trigger-1", type: "trigger.manual" },
        { id: "task-1", type: "task.human" },
        { id: "notify-1", type: "notification.simulate" },
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "task-1" },
        { id: "e2", source: "task-1", target: "notify-1" },
      ],
    };

    const result = advanceWorkflowInstanceState({
      state: {
        workflowId: 1,
        workflowVersionId: 101,
        currentNodeId: "trigger-1",
        status: "running",
      },
      graph,
      targetNodeId: "task-1",
      ...metadata,
    });

    expect(result.state).toMatchObject({ currentNodeId: "task-1", status: "waiting" });
    expect(result.transition.action).toBe("advance");
  });

  it("não conclui a instância ao entrar em task.human terminal; aguarda conclusão humana", () => {
    const graph: WorkflowInstanceGraph = {
      nodes: [
        { id: "trigger-1", type: "trigger.manual" },
        { id: "task-1", type: "task.human" },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "task-1" }],
    };

    const result = advanceWorkflowInstanceState({
      state: {
        workflowId: 1,
        workflowVersionId: 101,
        currentNodeId: "trigger-1",
        status: "running",
      },
      graph,
      targetNodeId: "task-1",
      ...metadata,
    });

    expect(result.state.status).toBe("waiting");
    expect(result.transition.action).toBe("advance");
  });
});
