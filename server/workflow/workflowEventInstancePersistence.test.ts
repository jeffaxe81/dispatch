import { describe, expect, it } from "vitest";
import { auditLogs, workflowExecutions, workflowVersions, workflows } from "../../drizzle/schema";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import { workflowExecutionTenantScopes, workflowTenantScopes } from "./workflowTenantScopeSchema";

const eventDefinition = {
  nodes: [
    {
      id: "event-trigger-1",
      type: "trigger.external_data",
      label: "Evento de ocorrência",
      position: { x: 0, y: 0 },
      configuration: {
        sourceApplication: "aplicacao_parceira",
        environment: "producao",
        eventType: "incident.created.v1",
      },
    },
    {
      id: "notification-1",
      type: "notification.simulate",
      label: "Aviso",
      position: { x: 180, y: 0 },
      configuration: { mode: "simulacao", channel: "painel_interno", messageTemplate: "Alerta" },
    },
  ],
  edges: [{ id: "edge-1", source: "event-trigger-1", target: "notification-1" }],
  metadata: { mode: "simulacao", definitionVersion: 1 },
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
  const workflow = { id: 1, active: true, simulationOnly: true, currentVersion: 1 };
  const publicationPointer = { id: 1, publishedVersion: 1 };
  const version = { id: 101, workflowId: 1, version: 1, definition: eventDefinition };
  const executions: Array<Record<string, unknown>> = [];
  const executionTenantScopes: Array<{ executionId: number; organizationId: number }> = [];
  const audits: Array<Record<string, unknown>> = [];

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
        throw new Error("Tabela inesperada no teste D-012F de start por evento.");
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: async () => {
            if (table === workflows) return [workflow];
            if (table === workflowTenantScopes) return [{ organizationId: 10 }];
            if (table === workflowPublicationPointers) return [publicationPointer];
            if (table === workflowVersions) return [version];
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

  return { tx, executions, executionTenantScopes, audits };
}

describe("D-012F event instance persistence", () => {
  it("inicia por evento dentro da transação existente e congela versão tenant idempotência e correlação", async () => {
    const module = await import("./workflowInstancePersistence") as unknown as {
      startEventWorkflowInstanceInTransaction?: (
        tx: ReturnType<typeof createHarness>["tx"],
        input: {
          workflowId: number;
          workflowVersionId: number;
          organizationId: number;
          triggerNodeId: string;
          eventId: string;
          eventType: "incident.created.v1";
          producer: "axe-dispatch";
          actorUserId: number;
          correlationId: string;
          payload: Record<string, unknown>;
        },
      ) => Promise<Record<string, unknown>>;
    };
    expect(typeof module.startEventWorkflowInstanceInTransaction).toBe("function");

    const harness = createHarness();
    const result = await module.startEventWorkflowInstanceInTransaction!(harness.tx, {
      workflowId: 1,
      workflowVersionId: 101,
      organizationId: 10,
      triggerNodeId: "event-trigger-1",
      eventId: "dispatch-event-runtime-1001",
      eventType: "incident.created.v1",
      producer: "axe-dispatch",
      actorUserId: 7,
      correlationId: "corr-event-runtime-1001",
      payload: { incidentId: 9001 },
    });

    expect(result).toMatchObject({
      executionId: 1,
      workflowId: 1,
      workflowVersionId: 101,
      currentNodeId: "event-trigger-1",
      status: "em_execucao",
    });
    expect(harness.executionTenantScopes).toEqual([{ executionId: 1, organizationId: 10 }]);
    expect(harness.executions[0]).toMatchObject({
      workflowId: 1,
      workflowVersionId: 101,
      triggerType: "event:incident.created.v1",
      idempotencyKey: "10:dispatch-event-runtime-1001",
      mode: "simulacao",
      status: "em_execucao",
      currentNodeId: "event-trigger-1",
      correlationId: "corr-event-runtime-1001",
      initiatedByUserId: 7,
      inputData: expect.objectContaining({
        eventId: "dispatch-event-runtime-1001",
        eventType: "incident.created.v1",
        producer: "axe-dispatch",
        payload: { incidentId: 9001 },
      }),
    });
    expect(harness.audits.at(-1)).toMatchObject({
      resourceType: "workflow_instance",
      resourceId: 1,
      action: "workflow_instance.start",
      actorUserId: 7,
      afterData: expect.objectContaining({
        workflowVersionId: 101,
        toNodeId: "event-trigger-1",
        correlationId: "corr-event-runtime-1001",
      }),
    });
  });
});
