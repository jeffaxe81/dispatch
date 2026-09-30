import { z } from "zod";

export const MAX_WORKFLOW_SLA_DUE_MINUTES = 525600;

export const workflowSlaConfigurationSchema = z.object({
  dueInMinutes: z.number().int().min(1).max(MAX_WORKFLOW_SLA_DUE_MINUTES),
  reminderBeforeMinutes: z.number().int().min(0),
  escalationAfterMinutes: z.number().int().min(0),
  escalationMode: z.enum(["notify_only", "reassign_task"]),
}).strict().superRefine((value, ctx) => {
  if (value.reminderBeforeMinutes >= value.dueInMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reminderBeforeMinutes"],
      message: "reminderBeforeMinutes deve ser menor que dueInMinutes.",
    });
  }
});

export type WorkflowSlaConfiguration = z.infer<typeof workflowSlaConfigurationSchema>;
export type WorkflowSlaState = "on_time" | "due_soon" | "overdue";

export type WorkflowSlaTimeline = {
  startedAt: string;
  reminderAt: string;
  dueAt: string;
  escalationAt: string;
};

export type WorkflowSlaEscalationIntent = {
  eventType: "workflow.task.escalation.requested.v1";
  taskId: number;
  organizationId: number;
  workflowVersionId: number;
  nodeId: string;
  correlationId: string;
  escalationMode: WorkflowSlaConfiguration["escalationMode"];
  occurredAt: string;
};

const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function parseUtcInstant(value: unknown, field: string): Date {
  if (typeof value !== "string" || !UTC_ISO_PATTERN.test(value)) {
    throw new Error(`${field} deve ser uma data ISO-8601 UTC.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} deve ser uma data ISO-8601 UTC válida.`);
  }
  return new Date(timestamp);
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${field} deve ser um inteiro positivo.`);
  }
  return value as number;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} é obrigatório.`);
  }
  return value.trim();
}

export function calculateWorkflowSlaTimeline(
  configurationInput: unknown,
  startedAtInput: unknown,
): WorkflowSlaTimeline {
  const configuration = workflowSlaConfigurationSchema.parse(configurationInput);
  const startedAt = parseUtcInstant(startedAtInput, "startedAt");
  const startedMs = startedAt.getTime();
  const minuteMs = 60_000;
  const dueMs = startedMs + configuration.dueInMinutes * minuteMs;
  const reminderMs = dueMs - configuration.reminderBeforeMinutes * minuteMs;
  const escalationMs = dueMs + configuration.escalationAfterMinutes * minuteMs;

  return {
    startedAt: startedAt.toISOString(),
    reminderAt: new Date(reminderMs).toISOString(),
    dueAt: new Date(dueMs).toISOString(),
    escalationAt: new Date(escalationMs).toISOString(),
  };
}

function normalizeTimeline(input: WorkflowSlaTimeline): WorkflowSlaTimeline {
  if (!input || typeof input !== "object") {
    throw new Error("Timeline SLA inválida.");
  }
  const startedAt = parseUtcInstant(input.startedAt, "startedAt").toISOString();
  const reminderAt = parseUtcInstant(input.reminderAt, "reminderAt").toISOString();
  const dueAt = parseUtcInstant(input.dueAt, "dueAt").toISOString();
  const escalationAt = parseUtcInstant(input.escalationAt, "escalationAt").toISOString();

  const startedMs = Date.parse(startedAt);
  const reminderMs = Date.parse(reminderAt);
  const dueMs = Date.parse(dueAt);
  const escalationMs = Date.parse(escalationAt);
  if (!(startedMs <= reminderMs && reminderMs <= dueMs && dueMs <= escalationMs)) {
    throw new Error("Timeline SLA inconsistente.");
  }

  return { startedAt, reminderAt, dueAt, escalationAt };
}

export function evaluateWorkflowSlaState(
  timelineInput: WorkflowSlaTimeline,
  nowInput: unknown,
): WorkflowSlaState {
  const timeline = normalizeTimeline(timelineInput);
  const now = parseUtcInstant(nowInput, "now").getTime();
  const due = Date.parse(timeline.dueAt);
  const reminder = Date.parse(timeline.reminderAt);

  if (now >= due) return "overdue";
  if (now >= reminder) return "due_soon";
  return "on_time";
}

export function buildWorkflowSlaEscalationIntent(input: {
  taskId: number;
  organizationId: number;
  workflowVersionId: number;
  nodeId: string;
  correlationId: string;
  configuration: unknown;
  timeline: WorkflowSlaTimeline;
  now: string;
}): WorkflowSlaEscalationIntent | null {
  const taskId = requirePositiveInteger(input.taskId, "taskId");
  const organizationId = requirePositiveInteger(input.organizationId, "organizationId");
  const workflowVersionId = requirePositiveInteger(input.workflowVersionId, "workflowVersionId");
  const nodeId = requireNonEmptyString(input.nodeId, "nodeId");
  const correlationId = requireNonEmptyString(input.correlationId, "correlationId");
  const configuration = workflowSlaConfigurationSchema.parse(input.configuration);
  const timeline = normalizeTimeline(input.timeline);

  const expectedTimeline = calculateWorkflowSlaTimeline(configuration, timeline.startedAt);
  if (
    expectedTimeline.reminderAt !== timeline.reminderAt
    || expectedTimeline.dueAt !== timeline.dueAt
    || expectedTimeline.escalationAt !== timeline.escalationAt
  ) {
    throw new Error("Timeline SLA diverge da configuração congelada.");
  }

  const now = parseUtcInstant(input.now, "now");
  if (now.getTime() < Date.parse(timeline.escalationAt)) return null;

  return {
    eventType: "workflow.task.escalation.requested.v1",
    taskId,
    organizationId,
    workflowVersionId,
    nodeId,
    correlationId,
    escalationMode: configuration.escalationMode,
    occurredAt: now.toISOString(),
  };
}
