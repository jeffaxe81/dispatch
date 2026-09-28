import { describe, expect, it } from "vitest";
import { planWorkflowSlaEvents } from "./workflowSlaScheduler";

const baseTask = {
  taskId: 71,
  organizationId: 9,
  workflowVersionId: 101,
  nodeId: "human-review",
  correlationId: "corr-sla-0001",
  status: "open" as const,
  slaReminderAt: "2026-09-28T10:45:00.000Z",
  slaDueAt: "2026-09-28T11:00:00.000Z",
  slaEscalationAt: "2026-09-28T11:30:00.000Z",
  escalationMode: "reassign_task" as const,
};

describe("D-012I I4 — planejamento seguro de eventos SLA", () => {
  it("emite lembrete, vencimento e intenção de escalonamento tenant-aware", () => {
    expect(planWorkflowSlaEvents({
      tasks: [baseTask],
      now: "2026-09-28T11:30:00.000Z",
      emittedEventKeys: new Set(),
    })).toEqual([
      expect.objectContaining({ eventType: "workflow.task.sla.reminder.v1", eventKey: "71:reminder", organizationId: 9 }),
      expect.objectContaining({ eventType: "workflow.task.sla.overdue.v1", eventKey: "71:overdue", organizationId: 9 }),
      expect.objectContaining({ eventType: "workflow.task.escalation.requested.v1", eventKey: "71:escalation", escalationMode: "reassign_task" }),
    ]);
  });

  it("é idempotente por tarefa e tipo de evento", () => {
    expect(planWorkflowSlaEvents({
      tasks: [baseTask],
      now: "2026-09-28T11:30:00.000Z",
      emittedEventKeys: new Set(["71:reminder", "71:overdue", "71:escalation"]),
    })).toEqual([]);
  });

  it("não emite eventos para tarefas terminadas ou datas futuras", () => {
    expect(planWorkflowSlaEvents({
      tasks: [{ ...baseTask, status: "completed" as const }, { ...baseTask, taskId: 72, slaReminderAt: "2026-09-28T12:00:00.000Z", slaDueAt: "2026-09-28T13:00:00.000Z", slaEscalationAt: "2026-09-28T14:00:00.000Z" }],
      now: "2026-09-28T11:30:00.000Z",
      emittedEventKeys: new Set(),
    })).toEqual([]);
  });

  it("replay concorrente do mesmo snapshot não duplica uma intenção no lote", () => {
    const events = planWorkflowSlaEvents({
      tasks: [baseTask, { ...baseTask }],
      now: "2026-09-28T11:30:00.000Z",
      emittedEventKeys: new Set(),
    });
    expect(events.map(event => event.eventKey)).toEqual(["71:reminder", "71:overdue", "71:escalation"]);
  });

  it("respeita fronteiras exatas e mantém tenants distintos no resultado", () => {
    const events = planWorkflowSlaEvents({
      tasks: [{ ...baseTask, organizationId: 9 }, { ...baseTask, taskId: 72, organizationId: 10, correlationId: "corr-sla-0002" }],
      now: "2026-09-28T10:45:00.000Z",
      emittedEventKeys: new Set(),
    });
    expect(events).toHaveLength(2);
    expect(events.every(event => event.eventType === "workflow.task.sla.reminder.v1")).toBe(true);
    expect(events.map(event => event.organizationId)).toEqual([9, 10]);
  });
});
