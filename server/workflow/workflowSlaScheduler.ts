import type { WorkflowSlaConfiguration } from "./workflowSla";

type WorkflowSlaOpenTask = {
  taskId: number;
  organizationId: number;
  workflowVersionId: number;
  nodeId: string;
  correlationId: string;
  status: "open" | "in_progress" | "completed" | "cancelled";
  slaReminderAt: string | null;
  slaDueAt: string | null;
  slaEscalationAt: string | null;
  escalationMode: WorkflowSlaConfiguration["escalationMode"];
};

type WorkflowSlaPlannedEvent = {
  eventType: "workflow.task.sla.reminder.v1" | "workflow.task.sla.overdue.v1" | "workflow.task.escalation.requested.v1";
  eventKey: string;
  taskId: number;
  organizationId: number;
  workflowVersionId: number;
  nodeId: string;
  correlationId: string;
  occurredAt: string;
  escalationMode?: WorkflowSlaConfiguration["escalationMode"];
};

function utcInstant(value: string | null, field: string): number | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error(`${field} deve ser ISO-8601 UTC.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} inválido.`);
  return timestamp;
}

function validateTask(task: WorkflowSlaOpenTask) {
  if (!Number.isInteger(task.taskId) || task.taskId < 1) throw new Error("taskId inválido.");
  if (!Number.isInteger(task.organizationId) || task.organizationId < 1) throw new Error("organizationId inválido.");
  if (!Number.isInteger(task.workflowVersionId) || task.workflowVersionId < 1) throw new Error("workflowVersionId inválido.");
  if (!task.nodeId.trim() || !task.correlationId.trim()) throw new Error("Metadados da tarefa SLA inválidos.");
}

export function planWorkflowSlaEvents(input: {
  tasks: WorkflowSlaOpenTask[];
  now: string;
  emittedEventKeys: ReadonlySet<string>;
}): WorkflowSlaPlannedEvent[] {
  const now = utcInstant(input.now, "now");
  if (now === null) throw new Error("now é obrigatório.");
  const occurredAt = new Date(now).toISOString();
  const planned: WorkflowSlaPlannedEvent[] = [];

  for (const task of input.tasks) {
    validateTask(task);
    if (task.status === "completed" || task.status === "cancelled") continue;

    const candidates: Array<{
      kind: "reminder" | "overdue" | "escalation";
      at: string | null;
      eventType: WorkflowSlaPlannedEvent["eventType"];
    }> = [
      { kind: "reminder", at: task.slaReminderAt, eventType: "workflow.task.sla.reminder.v1" },
      { kind: "overdue", at: task.slaDueAt, eventType: "workflow.task.sla.overdue.v1" },
      { kind: "escalation", at: task.slaEscalationAt, eventType: "workflow.task.escalation.requested.v1" },
    ];

    for (const candidate of candidates) {
      const dueAt = utcInstant(candidate.at, `sla ${candidate.kind}`);
      const eventKey = `${task.taskId}:${candidate.kind}`;
      if (dueAt === null || now < dueAt || input.emittedEventKeys.has(eventKey)) continue;
      planned.push({
        eventType: candidate.eventType,
        eventKey,
        taskId: task.taskId,
        organizationId: task.organizationId,
        workflowVersionId: task.workflowVersionId,
        nodeId: task.nodeId,
        correlationId: task.correlationId,
        occurredAt,
        ...(candidate.kind === "escalation" ? { escalationMode: task.escalationMode } : {}),
      });
    }
  }

  return planned;
}
