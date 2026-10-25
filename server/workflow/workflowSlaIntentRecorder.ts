import { planWorkflowSlaEvents } from "./workflowSlaScheduler";

export type WorkflowSlaTaskSnapshot = Parameters<typeof planWorkflowSlaEvents>[0]["tasks"][number];
export type WorkflowSlaPlannedIntent = ReturnType<typeof planWorkflowSlaEvents>[number] & {
  scheduledAt: string;
};

export type WorkflowSlaIntentRecorderAdapter<TTransaction> = {
  // The adapter must hold a DB row lock on the task until commit.
  transaction<TResult>(run: (tx: TTransaction) => Promise<TResult>): Promise<TResult>;
  loadTaskForUpdate(
    tx: TTransaction,
    taskId: number,
    organizationId: number,
  ): Promise<WorkflowSlaTaskSnapshot | null>;
  insertIntentIfAbsent(
    tx: TTransaction,
    event: WorkflowSlaPlannedIntent,
  ): Promise<"created" | "duplicate">;
};

function scheduledAtForEvent(
  task: WorkflowSlaTaskSnapshot,
  eventType: WorkflowSlaPlannedIntent["eventType"],
): string {
  const scheduledAt = eventType === "workflow.task.sla.reminder.v1"
    ? task.slaReminderAt
    : eventType === "workflow.task.sla.overdue.v1"
      ? task.slaDueAt
      : task.slaEscalationAt;
  if (scheduledAt === null) {
    throw new Error("Intenção de SLA sem prazo congelado correspondente.");
  }
  return scheduledAt;
}

/**
 * I4: durable planning only. It stores intents; it does not publish events,
 * reassign tasks or mutate incident state. Atomicity belongs to the adapter.
 */
export function createWorkflowSlaIntentRecorder<TTransaction>(
  adapter: WorkflowSlaIntentRecorderAdapter<TTransaction>,
) {
  return {
    async recordForTask(input: {
      taskId: number;
      organizationId: number;
      now: string;
    }): Promise<{ created: string[]; duplicates: number }> {
      if (!Number.isSafeInteger(input.taskId) || input.taskId < 1
        || !Number.isSafeInteger(input.organizationId) || input.organizationId < 1) {
        throw new Error("Identificadores de tarefa/organização inválidos.");
      }

      return adapter.transaction(async tx => {
        const task = await adapter.loadTaskForUpdate(
          tx,
          input.taskId,
          input.organizationId,
        );
        if (!task) throw new Error("Tarefa SLA não encontrada no tenant solicitado.");
        if (task.taskId !== input.taskId || task.organizationId !== input.organizationId) {
          throw new Error("Snapshot SLA pertence a outra tarefa ou organização.");
        }

        // Evaluate the entire frozen snapshot before any insert.
        const planned = planWorkflowSlaEvents({
          tasks: [task],
          now: input.now,
          emittedEventKeys: new Set(),
        });
        const created: string[] = [];
        let duplicates = 0;
        for (const event of planned) {
          const result = await adapter.insertIntentIfAbsent(tx, {
            ...event,
            scheduledAt: scheduledAtForEvent(task, event.eventType),
          });
          if (result === "created") created.push(event.eventKey);
          else duplicates += 1;
        }
        return { created, duplicates };
      });
    },
  };
}
