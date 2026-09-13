import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, workflowExecutions, workflowVersions, workflows } from "../../drizzle/schema";
import { setDbForTesting } from "../dbLegacy";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import { workflowExecutionTenantScopes, workflowTenantScopes } from "./workflowTenantScopeSchema";
import {
  advanceManualWorkflowInstance,
  cancelManualWorkflowInstance,
  startManualWorkflowInstance,
} from "./workflowInstancePersistence";

const publishedDefinition = {
  nodes: [
    { id: "trigger-1", type: "trigger.manual", label: "Gatilho", position: { x: 0, y: 0 }, configuration: { mode: "simulacao", inputLabel: "entrada_manual" } },
    { id: "notification-1", type: "notification.simulate", label: "Aviso", position: { x: 180, y: 0 }, configuration: { mode: "simulacao", channel: "painel_interno", messageTemplate: "Alerta" } },
  ],
  edges: [{ id: "edge-1", source: "trigger-1", target: "notification-1" }],
  metadata: { mode: "simulacao", definitionVersion: 1 },
};

const draftDefinition = {
  ...publishedDefinition,
  nodes: [
    ...publishedDefinition.nodes,
    { id: "draft-only", type: "notification.simulate", label: "Rascunho", position: { x: 360, y: 0 }, configuration: { mode: "simulacao", channel: "painel_interno", messageTemplate: "Não executar" } },
  ],
  edges: [...publishedDefinition.edges, { id: "edge-draft", source: "notification-1", target: "draft-only" }],
  metadata: { mode: "simulacao", definitionVersion: 2 },
};

function conditionContainsNumber(value: unknown, expected: number, visited = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (visited.has(value as object)) return false;
  visited.add(value as object);
  if ((value as { value?: unknown }).value === expected) return true;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(nested) && nested.some(item => conditionContainsNumber(item, expected, visited))) return true;
    if (nested && typeof nested === "object" && conditionContainsNumber(nested, expected, visited)) return true;
  }
  return false;
}

function createHarness() {
  const workflow = { id: 1, active: true, simulationOnly: true, currentVersion: 2 };
  const publishedPointer = { id: 1, publishedVersion: 1 };
  const publishedVersion = { id: 101, workflowId: 1, version: 1, definition: publishedDefinition };
  const draftVersion = { id: 202, workflowId: 1, version: 2, definition: draftDefinition };
  const executions: Array<Record<string, unknown>> = [];
  const executionTenantScopes: Array<{ executionId: number; organizationId: number }> = [];
  const audits: Array<Record<string, unknown>> = [];
  let publicationReads = 0;

  const tx = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === workflowExecutions) {
          return {
            $returningId: async () => {
              const id = executions.length + 1;
              executions.push({ id, currentNodeId: null, correlationId: null, ...values });
              return [{ id }];
            },
          };
        }
        if (table === workflowExecutionTenantScopes) {
          executionTenantScopes.push(values as { executionId: number; organizationId: number });
          return Promise.resolve();
        }
        if (table === auditLogs) {
          audits.push({ id: audits.length + 1, ...values });
          return Promise.resolve();
        }
        throw new Error("Tabela inesperada no teste D-012C/D-012E.");
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: async () => {
            if (table === workflows) return [workflow];
            if (table === workflowTenantScopes) return [{ organizationId: 10 }];
            if (table === workflowExecutionTenantScopes) {
              const row = executionTenantScopes.find(scope => conditionContainsNumber(condition, scope.executionId));
              return row ? [row] : [];
            }
            if (table === workflowPublicationPointers) {
              publicationReads += 1;
              return [publishedPointer];
            }
            if (table === workflowVersions) {
              if (conditionContainsNumber(condition, 202) || conditionContainsNumber(condition, 2)) return [draftVersion];
              return [publishedVersion];
            }
            if (table === workflowExecutions || table === workflowInstanceExecutions) {
              const row = executions.find(execution => conditionContainsNumber(condition, Number(execution.id)));
              return row ? [row] : [];
            }
            return [];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          if (table !== workflowExecutions && table !== workflowInstanceExecutions) return;
          const row = executions.find(execution => conditionContainsNumber(condition, Number(execution.id)));
          if (row) Object.assign(row, patch);
        },
      }),
    }),
  };

  return {
    db: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) },
    workflow,
    publishedPointer,
    executions,
    executionTenantScopes,
    audits,
    getPublicationReads: () => publicationReads,
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

describe("D-012C/D-012E transações da instância stateful", () => {
  it("inicia manualmente na versão publicada e congela o tenant da execução na mesma transação", async () => {
    const harness = createHarness();
    setDbForTesting(harness.db as never);

    const result = await startManualWorkflowInstance({
      workflowId: 1,
      organizationId: 10,
      actorUserId: 7,
      correlationId: "corr-start-1",
      inputData: { source: "teste" },
    } as never);

    expect(result).toMatchObject({
      executionId: 1,
      workflowId: 1,
      workflowVersionId: 101,
      currentNodeId: "trigger-1",
      status: "em_execucao",
    });
    expect(harness.executionTenantScopes).toEqual([{ executionId: 1, organizationId: 10 }]);
    expect(harness.executions[0]).toMatchObject({
      workflowId: 1,
      workflowVersionId: 101,
      mode: "simulacao",
      status: "em_execucao",
      currentNodeId: "trigger-1",
      correlationId: "corr-start-1",
      initiatedByUserId: 7,
    });
    expect(harness.audits.at(-1)).toMatchObject({
      resourceType: "workflow_instance",
      resourceId: 1,
      action: "workflow_instance.start",
      actorUserId: 7,
      afterData: expect.objectContaining({
        workflowVersionId: 101,
        toNodeId: "trigger-1",
        correlationId: "corr-start-1",
      }),
    });
  });

  it("avança pela versão e pelo tenant congelados mesmo se a publicação mudar depois do início", async () => {
    const harness = createHarness();
    setDbForTesting(harness.db as never);

    await startManualWorkflowInstance({ workflowId: 1, organizationId: 10, actorUserId: 7, correlationId: "corr-start-2" } as never);
    expect(harness.getPublicationReads()).toBe(1);

    harness.publishedPointer.publishedVersion = 2;
    const result = await advanceManualWorkflowInstance({
      executionId: 1,
      organizationId: 10,
      targetNodeId: "notification-1",
      actorUserId: 8,
      correlationId: "corr-advance-2",
    } as never);

    expect(harness.getPublicationReads()).toBe(1);
    expect(result).toMatchObject({
      executionId: 1,
      workflowVersionId: 101,
      currentNodeId: "notification-1",
      status: "concluida",
    });
    expect(harness.executions[0]).toMatchObject({
      workflowVersionId: 101,
      currentNodeId: "notification-1",
      status: "concluida",
      correlationId: "corr-advance-2",
    });
    expect(harness.audits.at(-1)).toMatchObject({
      action: "workflow_instance.complete",
      actorUserId: 8,
      beforeData: expect.objectContaining({ fromNodeId: "trigger-1" }),
      afterData: expect.objectContaining({ toNodeId: "notification-1", correlationId: "corr-advance-2" }),
    });
  });

  it("nega avanço cross-tenant antes de qualquer mutação persistida", async () => {
    const harness = createHarness();
    setDbForTesting(harness.db as never);
    await startManualWorkflowInstance({ workflowId: 1, organizationId: 10, actorUserId: 7, correlationId: "corr-start-tenant" } as never);

    const before = structuredClone(harness.executions[0]);
    const auditCount = harness.audits.length;

    await expect(advanceManualWorkflowInstance({
      executionId: 1,
      organizationId: 11,
      targetNodeId: "notification-1",
      actorUserId: 8,
      correlationId: "corr-cross-tenant",
    } as never)).rejects.toThrow(/outra organização|tenant/i);

    expect(harness.executions[0]).toEqual(before);
    expect(harness.audits).toHaveLength(auditCount);
  });

  it("rejeita nó presente apenas no rascunho sem qualquer mutação persistida", async () => {
    const harness = createHarness();
    setDbForTesting(harness.db as never);
    await startManualWorkflowInstance({ workflowId: 1, organizationId: 10, actorUserId: 7, correlationId: "corr-start-3" } as never);

    const before = structuredClone(harness.executions[0]);
    const auditCount = harness.audits.length;

    await expect(advanceManualWorkflowInstance({
      executionId: 1,
      organizationId: 10,
      targetNodeId: "draft-only",
      actorUserId: 7,
      correlationId: "corr-invalid-3",
    } as never)).rejects.toThrow("não existe na versão congelada");

    expect(harness.executions[0]).toEqual(before);
    expect(harness.audits).toHaveLength(auditCount);
  });

  it("cancela instância ativa preservando o último nó e registra auditoria", async () => {
    const harness = createHarness();
    setDbForTesting(harness.db as never);
    await startManualWorkflowInstance({ workflowId: 1, organizationId: 10, actorUserId: 7, correlationId: "corr-start-4" } as never);

    const result = await cancelManualWorkflowInstance({
      executionId: 1,
      organizationId: 10,
      actorUserId: 9,
      correlationId: "corr-cancel-4",
    } as never);

    expect(result).toMatchObject({ currentNodeId: "trigger-1", status: "cancelada" });
    expect(harness.executions[0]).toMatchObject({ currentNodeId: "trigger-1", status: "cancelada", correlationId: "corr-cancel-4" });
    expect(harness.audits.at(-1)).toMatchObject({
      action: "workflow_instance.cancel",
      actorUserId: 9,
      afterData: expect.objectContaining({ toNodeId: "trigger-1", correlationId: "corr-cancel-4" }),
    });
  });

  it("falha fechado ao iniciar workflow inativo, não-simulado ou sem versão publicada", async () => {
    const inactive = createHarness();
    inactive.workflow.active = false;
    setDbForTesting(inactive.db as never);
    await expect(startManualWorkflowInstance({ workflowId: 1, organizationId: 10, actorUserId: 7, correlationId: "corr-inactive" } as never)).rejects.toThrow("ativo");

    const production = createHarness();
    production.workflow.simulationOnly = false;
    setDbForTesting(production.db as never);
    await expect(startManualWorkflowInstance({ workflowId: 1, organizationId: 10, actorUserId: 7, correlationId: "corr-production" } as never)).rejects.toThrow("simulação");

    const unpublished = createHarness();
    unpublished.publishedPointer.publishedVersion = 0;
    setDbForTesting(unpublished.db as never);
    await expect(startManualWorkflowInstance({ workflowId: 1, organizationId: 10, actorUserId: 7, correlationId: "corr-unpublished" } as never)).rejects.toThrow("versão publicada");
  });
});
