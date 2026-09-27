import { describe, expect, it } from "vitest";
import {
  buildWorkflowSlaEscalationIntent,
  calculateWorkflowSlaTimeline,
  evaluateWorkflowSlaState,
  workflowSlaConfigurationSchema,
} from "./workflowSla";

describe("D-012I I1 — contrato temporal puro", () => {
  const config = {
    dueInMinutes: 60,
    reminderBeforeMinutes: 15,
    escalationAfterMinutes: 30,
    escalationMode: "notify_only",
  } as const;

  it("aceita somente configuração SLA estrita e limitada", () => {
    expect(workflowSlaConfigurationSchema.parse(config)).toEqual(config);

    for (const invalid of [
      { ...config, dueInMinutes: 0 },
      { ...config, dueInMinutes: 525601 },
      { ...config, reminderBeforeMinutes: -1 },
      { ...config, reminderBeforeMinutes: 60 },
      { ...config, escalationAfterMinutes: -1 },
      { ...config, escalationMode: "execute_script" },
      { ...config, arbitraryDate: "2030-01-01T00:00:00Z" },
    ]) {
      expect(() => workflowSlaConfigurationSchema.parse(invalid)).toThrow();
    }
  });

  it("calcula timeline UTC a partir do instante congelado da tarefa", () => {
    expect(calculateWorkflowSlaTimeline(
      config,
      "2026-09-27T12:00:00.000Z",
    )).toEqual({
      startedAt: "2026-09-27T12:00:00.000Z",
      reminderAt: "2026-09-27T12:45:00.000Z",
      dueAt: "2026-09-27T13:00:00.000Z",
      escalationAt: "2026-09-27T13:30:00.000Z",
    });
  });

  it("avalia on_time, due_soon e overdue nas fronteiras", () => {
    const timeline = calculateWorkflowSlaTimeline(config, "2026-09-27T12:00:00.000Z");

    expect(evaluateWorkflowSlaState(timeline, "2026-09-27T12:44:59.999Z")).toBe("on_time");
    expect(evaluateWorkflowSlaState(timeline, "2026-09-27T12:45:00.000Z")).toBe("due_soon");
    expect(evaluateWorkflowSlaState(timeline, "2026-09-27T12:59:59.999Z")).toBe("due_soon");
    expect(evaluateWorkflowSlaState(timeline, "2026-09-27T13:00:00.000Z")).toBe("overdue");
  });

  it("produz apenas intenção segura de escalonamento após escalationAt", () => {
    const timeline = calculateWorkflowSlaTimeline({
      ...config,
      escalationMode: "reassign_task",
    }, "2026-09-27T12:00:00.000Z");

    expect(buildWorkflowSlaEscalationIntent({
      taskId: 77,
      organizationId: 9,
      workflowVersionId: 101,
      nodeId: "human-review",
      correlationId: "corr-sla-0001",
      configuration: { ...config, escalationMode: "reassign_task" },
      timeline,
      now: "2026-09-27T13:29:59.999Z",
    })).toBeNull();

    expect(buildWorkflowSlaEscalationIntent({
      taskId: 77,
      organizationId: 9,
      workflowVersionId: 101,
      nodeId: "human-review",
      correlationId: "corr-sla-0001",
      configuration: { ...config, escalationMode: "reassign_task" },
      timeline,
      now: "2026-09-27T13:30:00.000Z",
    })).toEqual({
      eventType: "workflow.task.escalation.requested.v1",
      taskId: 77,
      organizationId: 9,
      workflowVersionId: 101,
      nodeId: "human-review",
      correlationId: "corr-sla-0001",
      escalationMode: "reassign_task",
      occurredAt: "2026-09-27T13:30:00.000Z",
    });
  });

  it("falha fechado para datas sem timezone ou inválidas", () => {
    expect(() => calculateWorkflowSlaTimeline(config, "2026-09-27T12:00:00")).toThrow();
    expect(() => calculateWorkflowSlaTimeline(config, "data-invalida")).toThrow();
  });
});
