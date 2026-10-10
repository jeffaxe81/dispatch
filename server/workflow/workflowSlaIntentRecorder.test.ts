import { describe, expect, it } from "vitest";
import {
  createWorkflowSlaIntentRecorder,
  type WorkflowSlaIntentRecorderAdapter,
  type WorkflowSlaPlannedIntent,
  type WorkflowSlaTaskSnapshot,
} from "./workflowSlaIntentRecorder";

const initialTask: WorkflowSlaTaskSnapshot = {
  taskId: 71,
  organizationId: 9,
  workflowVersionId: 101,
  nodeId: "human-review",
  correlationId: "corr-d012i-1",
  status: "open",
  slaReminderAt: "2026-09-28T10:45:00.000Z",
  slaDueAt: "2026-09-28T11:00:00.000Z",
  slaEscalationAt: "2026-09-28T11:30:00.000Z",
  escalationMode: "reassign_task",
};

type Tx = { writes: Map<string, WorkflowSlaPlannedIntent> };

function fakeStore(input: {
  task?: WorkflowSlaTaskSnapshot;
  failOnEventType?: WorkflowSlaPlannedIntent["eventType"];
} = {}) {
  const task = input.task ?? initialTask;
  let persisted = new Map<string, WorkflowSlaPlannedIntent>();
  let transactionTail = Promise.resolve();

  const adapter: WorkflowSlaIntentRecorderAdapter<Tx> = {
    async transaction<TResult>(run: (tx: Tx) => Promise<TResult>): Promise<TResult> {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const writes = new Map(persisted);
      try {
        const result = await run({ writes });
        persisted = writes;
        return result;
      } finally {
        release();
      }
    },
    async loadTaskForUpdate(_tx, taskId) {
      return task.taskId === taskId ? { ...task } : null;
    },
    async insertIntentIfAbsent(tx, event) {
      if (input.failOnEventType === event.eventType) {
        throw new Error("Falha de escrita simulada.");
      }
      const key = event.eventKey;
      const existing = tx.writes.get(key);
      if (existing) {
        if (existing.organizationId !== event.organizationId
          || existing.workflowVersionId !== event.workflowVersionId
          || existing.scheduledAt !== event.scheduledAt
          || existing.eventType !== event.eventType) {
          throw new Error("Intenção SLA divergente.");
        }
        return "duplicate";
      }
      tx.writes.set(key, event);
      return "created";
    },
  };
  return {
    recorder: createWorkflowSlaIntentRecorder(adapter),
    persisted: () => [...persisted.values()],
  };
}

describe("D-012I I4 — intenções SLA duráveis", () => {
  it("registra três intenções distintas e os instantes congelados", async () => {
    const store = fakeStore();
    const result = await store.recorder.recordForTask({
      taskId: 71, organizationId: 9, now: "2026-09-28T11:30:00.000Z",
    });
    expect(result).toEqual({
      created: ["71:reminder", "71:overdue", "71:escalation"],
      duplicates: 0,
    });
    expect(store.persisted().map(event => event.scheduledAt)).toEqual([
      initialTask.slaReminderAt,
      initialTask.slaDueAt,
      initialTask.slaEscalationAt,
    ]);
    expect(store.persisted().every(event => event.organizationId === 9
      && event.workflowVersionId === 101)).toBe(true);
    expect(store.persisted()[2]).toMatchObject({
      eventType: "workflow.task.escalation.requested.v1",
      escalationMode: "reassign_task",
    });
  });

  it("reexecução serial não duplica intenções", async () => {
    const store = fakeStore();
    const input = { taskId: 71, organizationId: 9, now: "2026-09-28T11:30:00.000Z" };
    await store.recorder.recordForTask(input);
    expect(await store.recorder.recordForTask(input)).toEqual({ created: [], duplicates: 3 });
    expect(store.persisted()).toHaveLength(3);
  });

  it("duas execuções concorrentes registram cada tipo de evento somente uma vez", async () => {
    const store = fakeStore();
    const input = { taskId: 71, organizationId: 9, now: "2026-09-28T11:30:00.000Z" };
    const results = await Promise.all([
      store.recorder.recordForTask(input),
      store.recorder.recordForTask(input),
    ]);
    expect(results.map(result => result.created.length).sort()).toEqual([0, 3]);
    expect(store.persisted()).toHaveLength(3);
  });

  it("rejeita snapshot de tenant diferente sem persistir eventos", async () => {
    const store = fakeStore();
    await expect(store.recorder.recordForTask({
      taskId: 71, organizationId: 10, now: "2026-09-28T11:30:00.000Z",
    })).rejects.toThrow(/organização/);
    expect(store.persisted()).toHaveLength(0);
  });

  it("faz rollback lógico do lote em falha de inserção intermediária", async () => {
    const store = fakeStore({ failOnEventType: "workflow.task.sla.overdue.v1" });
    await expect(store.recorder.recordForTask({
      taskId: 71, organizationId: 9, now: "2026-09-28T11:30:00.000Z",
    })).rejects.toThrow(/Falha de escrita/);
    expect(store.persisted()).toHaveLength(0);
  });

  it("não grava intents em tarefa concluída e respeita fronteira exata de tempo", async () => {
    const done = fakeStore({ task: { ...initialTask, status: "completed" } });
    expect(await done.recorder.recordForTask({
      taskId: 71, organizationId: 9, now: "2026-09-28T12:00:00.000Z",
    })).toEqual({ created: [], duplicates: 0 });
    expect(done.persisted()).toHaveLength(0);

    const active = fakeStore();
    expect(await active.recorder.recordForTask({
      taskId: 71, organizationId: 9, now: "2026-09-28T10:45:00.000Z",
    })).toEqual({ created: ["71:reminder"], duplicates: 0 });
    expect(active.persisted()).toHaveLength(1);
  });

  it("falha antes de qualquer escrita quando os prazos não são válidos", async () => {
    const store = fakeStore({ task: { ...initialTask, slaReminderAt: "2026-09-28T12:00:00.000Z" } });
    await expect(store.recorder.recordForTask({
      taskId: 71, organizationId: 9, now: "2026-09-28T13:00:00.000Z",
    })).rejects.toThrow(/Timeline SLA/);
    expect(store.persisted()).toHaveLength(0);
  });
});
