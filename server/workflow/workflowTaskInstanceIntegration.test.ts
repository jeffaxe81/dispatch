import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, workflowExecutions, workflowVersions, workflows } from "../../drizzle/schema";
import { setDbForTesting } from "../dbLegacy";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import {
  advanceManualWorkflowInstance,
  cancelManualWorkflowInstance,
  resumeManualWorkflowInstanceFromCompletedTask,
  startManualWorkflowInstance,
} from "./workflowInstancePersistence";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import { workflowTasks } from "./workflowTaskSchema";

const definition = {
  nodes: [
    { id: "trigger-1", type: "trigger.manual", label: "Inicio", position: { x: 0, y: 0 }, configuration: { mode: "simulacao", inputLabel: "manual" } },
    { id: "human-1", type: "notification.simulate", label: "Validar", position: { x: 180, y: 0 }, configuration: { mode: "simulacao", channel: "painel_interno", messageTemplate: "Validar", requiresHumanTask: true, assigneeUserId: 11 } },
    { id: "notify-2", type: "notification.simulate", label: "Fim", position: { x: 360, y: 0 }, configuration: { mode: "simulacao", channel: "painel_interno", messageTemplate: "Fim" } },
  ],
  edges: [
    { id: "edge-1", source: "trigger-1", target: "human-1" },
    { id: "edge-2", source: "human-1", target: "notify-2" },
  ],
  metadata: { mode: "simulacao", definitionVersion: 1 },
};

function hasNumber(value: unknown, expected: number, visited = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (visited.has(value as object)) return false;
  visited.add(value as object);
  if ((value as { value?: unknown }).value === expected) return true;
  return Object.values(value as Record<string, unknown>).some(item => hasNumber(item, expected, visited));
}

function limited<T>(rows: T[]) {
  const promise = Promise.resolve(rows) as Promise<T[]> & { for: () => Promise<T[]> };
  promise.for = async () => rows;
  return promise;
}

function createHarness() {
  const workflow = { id: 1, active: true, simulationOnly: true, currentVersion: 1 };
  const pointer = { id: 1, publishedVersion: 1 };
  const version = { id: 101, workflowId: 1, version: 1, definition };
  const executions: Array<Record<string, any>> = [];
  const tasks: Array<Record<string, any>> = [];
  const audits: Array<Record<string, any>> = [];

  const rowsFor = (table: unknown, condition: unknown) => {
    if (table === workflows) return [workflow];
    if (table === workflowPublicationPointers) return [pointer];
    if (table === workflowVersions) return [version];
    if (table === workflowExecutions || table === workflowInstanceExecutions) {
      return executions.filter(row => hasNumber(condition, Number(row.id)) || executions.length === 1);
    }
    if (table === workflowTasks) {
      return tasks.filter(row => hasNumber(condition, Number(row.id)) || hasNumber(condition, Number(row.executionId)) || tasks.length === 1);
    }
    return [];
  };

  const tx = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === workflowExecutions) {
          return { $returningId: async () => {
            const id = executions.length + 1;
            executions.push({ id, currentNodeId: null, correlationId: null, ...values });
            return [{ id }];
          } };
        }
        if (table === workflowTasks) {
          return { $returningId: async () => {
            const id = tasks.length + 1;
            tasks.push({ id, ...values });
            return [{ id }];
          } };
        }
        if (table === auditLogs) {
          audits.push({ id: audits.length + 1, ...values });
          return Promise.resolve();
        }
        throw new Error("Tabela inesperada no teste D-012D.");
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: (count: number) => limited(rowsFor(table, condition).slice(0, count)),
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          const target = table === workflowTasks ? tasks : executions;
          const row = target.find(candidate => hasNumber(condition, Number(candidate.id))) ?? target[0];
          if (row) Object.assign(row, patch);
        },
      }),
    }),
  };

  return {
    db: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) },
    executions,
    tasks,
    audits,
  };
}

let originalNodeEnv: string | undefined;
beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
});
afterEach(() => {
  setDbForTesting(null);
  process.env.NODE_ENV = originalNodeEnv;
});

describe("D-012D task and instance integration", () => {
  it("creates one task, waits, blocks direct advance and resumes only after completion", async () => {
    const harness = createHarness();
    setDbForTesting(harness.db as never);

    await startManualWorkflowInstance({ workflowId: 1, actorUserId: 7, correlationId: "corr-start" });
    const waiting = await advanceManualWorkflowInstance({ executionId: 1, targetNodeId: "human-1", actorUserId: 7, correlationId: "corr-wait" });

    expect(waiting.status).toBe("pendente");
    expect(harness.tasks).toHaveLength(1);
    expect(harness.tasks[0]).toMatchObject({ executionId: 1, workflowVersionId: 101, nodeId: "human-1", status: "open", assigneeUserId: 11 });
    await expect(advanceManualWorkflowInstance({ executionId: 1, targetNodeId: "notify-2", actorUserId: 11, correlationId: "corr-blocked" })).rejects.toThrow("waiting");
    expect(harness.tasks).toHaveLength(1);

    harness.tasks[0].status = "completed";
    const resumed = await resumeManualWorkflowInstanceFromCompletedTask({ executionId: 1, taskId: 1, targetNodeId: "notify-2", actorUserId: 11, correlationId: "corr-resume" });
    expect(resumed.status).toBe("concluida");
    expect(resumed.currentNodeId).toBe("notify-2");
  });

  it("cancels non-terminal tasks when the waiting instance is cancelled", async () => {
    const harness = createHarness();
    setDbForTesting(harness.db as never);

    await startManualWorkflowInstance({ workflowId: 1, actorUserId: 7, correlationId: "corr-start-2" });
    await advanceManualWorkflowInstance({ executionId: 1, targetNodeId: "human-1", actorUserId: 7, correlationId: "corr-wait-2" });
    const cancelled = await cancelManualWorkflowInstance({ executionId: 1, actorUserId: 9, correlationId: "corr-cancel" });

    expect(cancelled.status).toBe("cancelada");
    expect(harness.tasks[0].status).toBe("cancelled");
    expect(harness.audits.some(audit => audit.action === "workflow_task.cancel")).toBe(true);
  });
});
