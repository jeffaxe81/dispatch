export type WorkflowSlaOperationalEventKind = "reminder" | "overdue" | "escalation";
export type WorkflowSlaOperationalDeliveryStatus = "pending" | "leased" | "dead_letter";

export type WorkflowSlaOperationalRow = {
  intentId: number;
  taskId: number;
  organizationId: number;
  eventKind: WorkflowSlaOperationalEventKind;
  deliveryStatus: WorkflowSlaOperationalDeliveryStatus;
  taskStatus: "open" | "in_progress";
  assigneeUserId: number | null;
  scheduledAt: string;
  correlationId: string;
  attempts: number;
};

export type WorkflowSlaOperationalItem = WorkflowSlaOperationalRow & {
  minutesFromNow: number;
  timing: "future" | "due";
};

export type WorkflowSlaOperationalReadStore = {
  list(input: { organizationId: number; limit: number; now: string }): Promise<WorkflowSlaOperationalRow[]>;
};

function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} inválido.`);
}

function strictUtc(value: string, label: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} deve ser UTC ISO-8601 com milissegundos.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} contém calendário UTC inválido.`);
  }
  return timestamp;
}

function validateRow(row: WorkflowSlaOperationalRow, organizationId: number) {
  positiveId(row.intentId, "intentId");
  positiveId(row.taskId, "taskId");
  if (row.organizationId !== organizationId) throw new Error("Linha SLA fora do tenant/escopo autorizado.");
  if (!["reminder", "overdue", "escalation"].includes(row.eventKind)) throw new Error("Tipo de evento SLA inválido.");
  if (!["pending", "leased", "dead_letter"].includes(row.deliveryStatus)) throw new Error("Estado de entrega SLA não operacional.");
  if (!["open", "in_progress"].includes(row.taskStatus)) throw new Error("Estado de tarefa SLA não operacional.");
  if (row.assigneeUserId !== null) positiveId(row.assigneeUserId, "assigneeUserId");
  if (!Number.isSafeInteger(row.attempts) || row.attempts < 0) throw new Error("Tentativas SLA inválidas.");
  if (typeof row.correlationId !== "string" || !row.correlationId || row.correlationId.trim() !== row.correlationId || row.correlationId.length > 160) {
    throw new Error("Correlação SLA inválida.");
  }
  strictUtc(row.scheduledAt, "scheduledAt");
}

export function createWorkflowSlaOperationalReadModel(store: WorkflowSlaOperationalReadStore) {
  return {
    async list(input: { organizationId: number; limit?: number; now: string }): Promise<WorkflowSlaOperationalItem[]> {
      positiveId(input.organizationId, "organizationId");
      const limit = input.limit ?? 50;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Limite SLA inválido.");
      const nowMs = strictUtc(input.now, "now");
      const rows = await store.list({ organizationId: input.organizationId, limit, now: input.now });
      return rows.map(row => {
        validateRow(row, input.organizationId);
        const scheduledMs = strictUtc(row.scheduledAt, "scheduledAt");
        const minutesFromNow = Math.trunc((scheduledMs - nowMs) / 60_000);
        return {
          ...row,
          minutesFromNow,
          timing: scheduledMs <= nowMs ? "due" as const : "future" as const,
        };
      });
    },
  };
}
