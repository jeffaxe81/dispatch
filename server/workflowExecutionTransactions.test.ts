import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, integrationLogs, workflowExecutions, workflowExecutionSteps, workflowVersions, workflows } from "../drizzle/schema";
import { executeSimulatedWorkflow, retrySimulatedWorkflowExecution, setDbForTesting } from "./db";

const definition = {
  nodes: [
    { id: "trigger-1", type: "trigger.manual", label: "Gatilho", position: { x: 0, y: 0 }, configuration: { mode: "simulacao", inputLabel: "entrada_manual" } },
    { id: "notification-1", type: "notification.simulate", label: "Aviso", position: { x: 180, y: 0 }, configuration: { mode: "simulacao", channel: "painel_interno", messageTemplate: "Alerta" } },
  ],
  edges: [{ id: "edge-1", source: "trigger-1", target: "notification-1" }],
  metadata: { mode: "simulacao", definitionVersion: 1 },
};

function conditionIncludes(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks.some(chunk => Boolean(chunk) && typeof chunk === "object" && (chunk as { name?: unknown }).name === key);
}

function conditionNumber(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks ?? [];
  const parameter = chunks.find(chunk => Boolean(chunk) && typeof chunk === "object" && typeof (chunk as { value?: unknown }).value === "number") as { value?: number } | undefined;
  return parameter?.value;
}

function createExecutionHarness() {
  const workflow = { id: 1, active: true, simulationOnly: true, currentVersion: 1 };
  const version = { id: 1, workflowId: 1, version: 1, definition };
  const executions: Array<Record<string, unknown>> = [];
  const steps: Array<Record<string, unknown>> = [];
  const logs: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];

  const tx = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === workflowExecutions) return { $returningId: async () => { const id = executions.length + 1; executions.push({ id, ...values }); return [{ id }]; } };
        if (table === workflowExecutionSteps) {
          if (steps.some(step => step.executionId === values.executionId && step.nodeId === values.nodeId)) throw new Error("workflow_execution_steps_execution_node_unique");
          steps.push({ id: steps.length + 1, ...values });
          return Promise.resolve();
        }
        if (table === integrationLogs) { logs.push({ id: logs.length + 1, ...values }); return Promise.resolve(); }
        if (table === auditLogs) { audits.push({ id: audits.length + 1, ...values }); return Promise.resolve(); }
        throw new Error("Tabela inesperada no teste de executor.");
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: async () => {
            if (table === workflows) return [workflow];
            if (table === workflowVersions) return [version];
            if (table === workflowExecutions) {
              const requestedId = conditionNumber(condition);
              const matching = conditionIncludes(condition, "retry_of_execution_id")
                ? executions.filter(execution => execution.retryOfExecutionId === requestedId)
                : executions.filter(execution => execution.id === requestedId);
              return matching.slice(0, 1);
            }
            return [];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          if (table === workflowExecutions && executions.length) Object.assign(executions.at(-1)!, patch);
        },
      }),
    }),
  };

  return { db: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) }, executions, steps, logs, audits };
}

let originalNodeEnv: string | undefined;
beforeEach(() => { originalNodeEnv = process.env.NODE_ENV; process.env.NODE_ENV = "test"; });
afterEach(() => { setDbForTesting(null); process.env.NODE_ENV = originalNodeEnv; });

describe("transações do executor simulado", () => {
  it("persiste o êxito e o ciclo de retry até dead-letter na mesma execução", async () => {
    const harness = createExecutionHarness();
    setDbForTesting(harness.db as never);

    const success = await executeSimulatedWorkflow({ workflowId: 1, actorUserId: 7 });
    const failure = await executeSimulatedWorkflow({ workflowId: 1, actorUserId: 7, inputData: { simulateFailure: true } });
    const retryOne = await retrySimulatedWorkflowExecution({ executionId: failure.executionId, actorUserId: 7 });
    await expect(retrySimulatedWorkflowExecution({ executionId: failure.executionId, actorUserId: 7 })).rejects.toThrow("já foi reprocessada");
    const retryTwo = await retrySimulatedWorkflowExecution({ executionId: retryOne.executionId, actorUserId: 7 });

    expect(success).toMatchObject({ executionId: 1, status: "concluida", attempts: 1 });
    expect(failure).toMatchObject({ executionId: 2, status: "falha", attempts: 1 });
    expect(retryOne).toMatchObject({ executionId: 3, status: "falha", attempts: 2 });
    expect(retryTwo).toMatchObject({ executionId: 4, status: "dead_letter", attempts: 3 });
    expect(harness.executions).toHaveLength(4);
    expect(harness.executions[2]).toMatchObject({ id: 3, retryOfExecutionId: 2, status: "falha", attempts: 2, triggerType: "manual_retry" });
    expect(harness.executions[3]).toMatchObject({ id: 4, retryOfExecutionId: 3, status: "dead_letter", attempts: 3, triggerType: "manual_retry" });
    expect(harness.steps.filter(step => step.executionId === 2)).toHaveLength(2);
    expect(harness.steps.filter(step => step.executionId === 3)).toHaveLength(2);
    expect(harness.steps.filter(step => step.executionId === 4)).toHaveLength(2);
    expect(harness.logs.some(log => String(log.message).includes("reprocessada em novo registro"))).toBe(true);
    expect(harness.audits.map(entry => entry.action)).toEqual(expect.arrayContaining(["workflow_execution.queue", "workflow_execution.complete", "workflow_execution.fail", "workflow_execution.retry", "workflow_execution.dead_letter"]));
  });
});
