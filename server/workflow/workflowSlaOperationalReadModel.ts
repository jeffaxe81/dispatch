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

export function createWorkflowSlaOperationalReadModel(_store: WorkflowSlaOperationalReadStore) {
  return {
    async list(_input: { organizationId: number; limit?: number; now: string }): Promise<WorkflowSlaOperationalItem[]> {
      throw new Error("D-012J read model ainda não implementado.");
    },
  };
}
