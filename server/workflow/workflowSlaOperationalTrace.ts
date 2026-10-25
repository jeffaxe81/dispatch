import type {
  WorkflowSlaOperationalDeliveryStatus,
  WorkflowSlaOperationalEventKind,
  WorkflowSlaOperationalRow,
} from "./workflowSlaOperationalReadModel";

export type WorkflowSlaDiagnosticCode = "pending" | "in_flight" | "quarantine";

export type WorkflowSlaCorrelationTrace = {
  correlationId: string;
  organizationId: number;
  intentIds: number[];
  taskIds: number[];
  eventKinds: WorkflowSlaOperationalEventKind[];
  deliveryStatuses: WorkflowSlaOperationalDeliveryStatus[];
  totalAttempts: number;
  firstScheduledAt: string;
  lastScheduledAt: string;
  diagnosticCode: WorkflowSlaDiagnosticCode;
};

function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} inválido.`);
}

function strictUtc(value: string, label: string): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(`${label} deve ser UTC ISO-8601 com milissegundos.`);
  }
  const timestamp = Date.parse(value);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    new Date(timestamp).toISOString() !== value
  ) {
    throw new Error(`${label} contém calendário UTC inválido.`);
  }
  return timestamp;
}

function validateRow(row: WorkflowSlaOperationalRow) {
  positiveId(row.intentId, "intentId");
  positiveId(row.taskId, "taskId");
  positiveId(row.organizationId, "organizationId");
  if (!["reminder", "overdue", "escalation"].includes(row.eventKind)) {
    throw new Error("Tipo de evento SLA inválido.");
  }
  if (!["pending", "leased", "dead_letter"].includes(row.deliveryStatus)) {
    throw new Error("Estado de entrega SLA inválido.");
  }
  if (!["open", "in_progress"].includes(row.taskStatus)) {
    throw new Error("Estado de tarefa SLA inválido.");
  }
  if (row.assigneeUserId !== null) positiveId(row.assigneeUserId, "assigneeUserId");
  if (!Number.isSafeInteger(row.attempts) || row.attempts < 0) {
    throw new Error("Tentativas SLA inválidas.");
  }
  if (
    typeof row.correlationId !== "string" ||
    row.correlationId.length < 1 ||
    row.correlationId.length > 160 ||
    row.correlationId.trim() !== row.correlationId
  ) {
    throw new Error("Correlação SLA inválida.");
  }
  strictUtc(row.scheduledAt, "scheduledAt");
}

function diagnosticCode(statuses: WorkflowSlaOperationalDeliveryStatus[]): WorkflowSlaDiagnosticCode {
  if (statuses.includes("dead_letter")) return "quarantine";
  if (statuses.includes("leased")) return "in_flight";
  return "pending";
}

export function buildWorkflowSlaOperationalTrace(
  rows: WorkflowSlaOperationalRow[],
): WorkflowSlaCorrelationTrace[] {
  if (!Array.isArray(rows)) throw new Error("Linhas SLA inválidas.");

  const traces = new Map<string, {
    correlationId: string;
    organizationId: number;
    intentIds: number[];
    taskIds: number[];
    eventKinds: WorkflowSlaOperationalEventKind[];
    deliveryStatuses: WorkflowSlaOperationalDeliveryStatus[];
    totalAttempts: number;
    firstScheduledAt: string;
    lastScheduledAt: string;
    firstScheduledAtMs: number;
    lastScheduledAtMs: number;
  }>();

  let tenantId: number | null = null;

  for (const row of rows) {
    validateRow(row);
    if (tenantId === null) tenantId = row.organizationId;
    if (row.organizationId !== tenantId) {
      throw new Error("Trilha SLA contém mais de uma organização/tenant.");
    }

    const scheduledAtMs = strictUtc(row.scheduledAt, "scheduledAt");
    const current = traces.get(row.correlationId);

    if (!current) {
      traces.set(row.correlationId, {
        correlationId: row.correlationId,
        organizationId: row.organizationId,
        intentIds: [row.intentId],
        taskIds: [row.taskId],
        eventKinds: [row.eventKind],
        deliveryStatuses: [row.deliveryStatus],
        totalAttempts: row.attempts,
        firstScheduledAt: row.scheduledAt,
        lastScheduledAt: row.scheduledAt,
        firstScheduledAtMs: scheduledAtMs,
        lastScheduledAtMs: scheduledAtMs,
      });
      continue;
    }

    if (current.organizationId !== row.organizationId) {
      throw new Error("Correlação SLA cruza organização/tenant.");
    }
    if (!current.intentIds.includes(row.intentId)) current.intentIds.push(row.intentId);
    if (!current.taskIds.includes(row.taskId)) current.taskIds.push(row.taskId);
    if (!current.eventKinds.includes(row.eventKind)) current.eventKinds.push(row.eventKind);
    if (!current.deliveryStatuses.includes(row.deliveryStatus)) {
      current.deliveryStatuses.push(row.deliveryStatus);
    }
    current.totalAttempts += row.attempts;

    if (scheduledAtMs < current.firstScheduledAtMs) {
      current.firstScheduledAtMs = scheduledAtMs;
      current.firstScheduledAt = row.scheduledAt;
    }
    if (scheduledAtMs > current.lastScheduledAtMs) {
      current.lastScheduledAtMs = scheduledAtMs;
      current.lastScheduledAt = row.scheduledAt;
    }
  }

  return [...traces.values()].map(({ firstScheduledAtMs: _first, lastScheduledAtMs: _last, ...trace }) => ({
    ...trace,
    diagnosticCode: diagnosticCode(trace.deliveryStatuses),
  }));
}
