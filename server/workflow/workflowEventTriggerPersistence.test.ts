import { describe, expect, it } from "vitest";

const persistenceModulePath = "./workflowEventTriggerPersistence";
const loadPersistence = () => import(persistenceModulePath);

const definition = {
  nodes: [
    {
      id: "incident-created",
      type: "trigger.external_data",
      configuration: { eventType: "incident.created.v1" },
    },
    {
      id: "form-submitted",
      type: "trigger.external_data",
      configuration: { eventType: "form.submission.submitted.v1" },
    },
    {
      id: "not-initial",
      type: "trigger.external_data",
      configuration: { eventType: "incident.created.v1" },
    },
    {
      id: "notify",
      type: "notification.simulate",
      configuration: {},
    },
  ],
  edges: [
    { id: "incoming", source: "notify", target: "not-initial" },
    { id: "incident-next", source: "incident-created", target: "notify" },
  ],
};

const envelope = {
  envelopeVersion: "1",
  eventId: "dispatch-event-persisted-1001",
  eventType: "incident.created.v1",
  occurredAt: "2026-09-13T20:50:00.000Z",
  tenantId: "42",
  correlationId: "corr-persisted-trigger-0001",
  actorUserId: "7",
  producer: "axe-dispatch",
  payload: { incidentId: 101 },
} as const;

describe("D-012F persisted event trigger boundary", () => {
  it("converte somente tenantId canônico positivo para organizationId", async () => {
    const { parseWorkflowEventTenantOrganizationId } = await loadPersistence();

    expect(parseWorkflowEventTenantOrganizationId("42")).toBe(42);
    expect(() => parseWorkflowEventTenantOrganizationId("tenant-a")).toThrow();
    expect(() => parseWorkflowEventTenantOrganizationId("0")).toThrow();
    expect(() => parseWorkflowEventTenantOrganizationId("042")).toThrow();
  });

  it("localiza somente trigger.external_data inicial com eventType exato", async () => {
    const { findWorkflowEventTriggerNodeIds } = await loadPersistence();

    expect(findWorkflowEventTriggerNodeIds(definition, "incident.created.v1")).toEqual(["incident-created"]);
    expect(findWorkflowEventTriggerNodeIds(definition, "form.submission.submitted.v1")).toEqual(["form-submitted"]);
    expect(findWorkflowEventTriggerNodeIds(definition, "inventory.asset.updated.v1")).toEqual([]);
  });

  it("mantém claim, matching, start e completion dentro da mesma transação", async () => {
    const { createWorkflowEventTriggerPersistence } = await loadPersistence();
    const calls: string[] = [];
    const tx = { id: "tx-1" };

    const persistence = createWorkflowEventTriggerPersistence({
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push("transaction:start");
        const result = await callback(tx);
        calls.push("transaction:end");
        return result;
      },
      buildDependencies: (transaction: typeof tx, organizationId: number) => {
        expect(transaction).toBe(tx);
        expect(organizationId).toBe(42);
        return {
          claimReceipt: async () => {
            calls.push("claim");
            return { status: "claimed" as const, tenantId: "42", eventId: envelope.eventId };
          },
          findStartCandidates: async () => {
            calls.push("match");
            return [{ workflowId: 1, workflowVersionId: 101, tenantId: "42", triggerNodeId: "incident-created" }];
          },
          findWaitingCandidates: async () => {
            calls.push("match:waiting");
            return [];
          },
          startInstance: async () => {
            calls.push("start");
            return { executionId: 5001 };
          },
          resumeInstance: async () => {
            throw new Error("resume inesperado");
          },
          completeReceipt: async () => {
            calls.push("complete");
          },
        };
      },
    });

    await expect(persistence.consume(envelope, 7)).resolves.toEqual({
      status: "processed",
      eventId: envelope.eventId,
      executionIds: [5001],
    });
    expect(calls).toEqual([
      "transaction:start",
      "claim",
      "match",
      "match:waiting",
      "start",
      "complete",
      "transaction:end",
    ]);
  });

  it("confirma o receipt failed antes de relançar erro do start fora da transação", async () => {
    const { createWorkflowEventTriggerPersistence } = await loadPersistence();
    const calls: string[] = [];
    const tx = { id: "tx-failure" };

    const persistence = createWorkflowEventTriggerPersistence({
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push("transaction:start");
        try {
          const result = await callback(tx);
          calls.push("transaction:commit");
          return result;
        } catch (error) {
          calls.push("transaction:rollback");
          throw error;
        }
      },
      buildDependencies: () => ({
        claimReceipt: async () => {
          calls.push("claim");
          return { status: "claimed" as const, tenantId: "42", eventId: envelope.eventId };
        },
        findStartCandidates: async () => {
          calls.push("match");
          return [{ workflowId: 1, workflowVersionId: 101, tenantId: "42", triggerNodeId: "incident-created" }];
        },
        findWaitingCandidates: async () => {
          calls.push("match:waiting");
          return [];
        },
        startInstance: async () => {
          calls.push("start");
          throw new Error("start indisponível");
        },
        resumeInstance: async () => {
          throw new Error("resume inesperado");
        },
        completeReceipt: async input => {
          calls.push(`complete:${input.status}`);
        },
      }),
    });

    await expect(persistence.consume(envelope, 7)).rejects.toThrow("start indisponível");
    expect(calls).toEqual([
      "transaction:start",
      "claim",
      "match",
      "match:waiting",
      "start",
      "complete:failed",
      "transaction:commit",
    ]);
  });

  it("expõe o consumer persistente usado pela API de produção", async () => {
    const { consumeWorkflowEventPersisted } = await loadPersistence();
    expect(typeof consumeWorkflowEventPersisted).toBe("function");
  });

  it("conecta o adapter real de banco ao claim, matching, start e completion na mesma transação", async () => {
    const module = await loadPersistence();
    const createDatabasePersistence = (module as unknown as {
      createWorkflowEventTriggerDatabasePersistence?: (database: unknown, operations: unknown) => {
        consume(input: typeof envelope, actorUserId: number): Promise<unknown>;
      };
    }).createWorkflowEventTriggerDatabasePersistence;
    expect(typeof createDatabasePersistence).toBe("function");

    const calls: string[] = [];
    const tx = { id: "tx-production-adapter" };
    const db = {
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push("transaction:start");
        const result = await callback(tx);
        calls.push("transaction:commit");
        return result;
      },
    };
    const operations = {
      claimReceipt: async (transaction: typeof tx, event: typeof envelope) => {
        expect(transaction).toBe(tx);
        expect(event).toEqual(envelope);
        calls.push("claim");
        return { status: "claimed" as const, tenantId: "42", eventId: envelope.eventId };
      },
      findStartCandidates: async (transaction: typeof tx, organizationId: number, eventType: string) => {
        expect(transaction).toBe(tx);
        expect(organizationId).toBe(42);
        expect(eventType).toBe(envelope.eventType);
        calls.push("match");
        return [{ workflowId: 9, workflowVersionId: 901, tenantId: "42", triggerNodeId: "incident-created" }];
      },
      findWaitingCandidates: async (transaction: typeof tx, organizationId: number, eventType: string) => {
        expect(transaction).toBe(tx);
        expect(organizationId).toBe(42);
        expect(eventType).toBe(envelope.eventType);
        calls.push("match:waiting");
        return [];
      },
      startInstance: async (transaction: typeof tx, input: Record<string, unknown>) => {
        expect(transaction).toBe(tx);
        expect(input).toEqual(expect.objectContaining({
          workflowId: 9,
          workflowVersionId: 901,
          organizationId: 42,
          triggerNodeId: "incident-created",
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          producer: envelope.producer,
          actorUserId: 7,
          correlationId: envelope.correlationId,
          payload: envelope.payload,
        }));
        calls.push("start");
        return { executionId: 7001 };
      },
      resumeInstance: async () => {
        throw new Error("resume inesperado");
      },
      completeReceipt: async (transaction: typeof tx, input: Record<string, unknown>) => {
        expect(transaction).toBe(tx);
        expect(input).toEqual(expect.objectContaining({
          tenantId: "42",
          eventId: envelope.eventId,
          status: "processed",
          workflowExecutionId: 7001,
        }));
        calls.push("complete");
      },
    };

    const persistence = createDatabasePersistence!(db, operations);
    await expect(persistence.consume(envelope, 7)).resolves.toEqual({
      status: "processed",
      eventId: envelope.eventId,
      executionIds: [7001],
    });
    expect(calls).toEqual([
      "transaction:start",
      "claim",
      "match",
      "match:waiting",
      "start",
      "complete",
      "transaction:commit",
    ]);
  });

  it("mantém resume de wait.event dentro da mesma transação e receipt", async () => {
    const { createWorkflowEventTriggerPersistence } = await loadPersistence();
    const calls: string[] = [];
    const tx = { id: "tx-wait-event" };
    const persistence = createWorkflowEventTriggerPersistence({
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push("transaction:start");
        const result = await callback(tx);
        calls.push("transaction:commit");
        return result;
      },
      buildDependencies: () => ({
        claimReceipt: async () => {
          calls.push("claim");
          return { status: "claimed" as const, tenantId: "42", eventId: envelope.eventId };
        },
        findStartCandidates: async () => {
          calls.push("match:start");
          return [];
        },
        findWaitingCandidates: async () => {
          calls.push("match:waiting");
          return [{
            executionId: 88,
            workflowId: 9,
            workflowVersionId: 901,
            tenantId: "42",
            currentNodeId: "wait-incident",
            targetNodeId: "notify",
          }];
        },
        startInstance: async () => {
          throw new Error("start inesperado");
        },
        resumeInstance: async input => {
          calls.push("resume");
          expect(input).toEqual(expect.objectContaining({
            executionId: 88,
            tenantId: "42",
            targetNodeId: "notify",
            eventType: envelope.eventType,
            correlationId: envelope.correlationId,
          }));
          return { executionId: 88 };
        },
        completeReceipt: async input => {
          calls.push(`complete:${input.status}`);
          expect(input).toEqual(expect.objectContaining({
            workflowExecutionId: 88,
            status: "processed",
          }));
        },
      }),
    });

    await expect(persistence.consume(envelope, 7)).resolves.toEqual({
      status: "processed",
      eventId: envelope.eventId,
      executionIds: [88],
    });
    expect(calls).toEqual([
      "transaction:start",
      "claim",
      "match:start",
      "match:waiting",
      "resume",
      "complete:processed",
      "transaction:commit",
    ]);
  });

  it("conecta o consumer de produção ao runtime persistente antes de processar o evento", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const { setDbForTesting } = await import("../dbLegacy");
      setDbForTesting(null);
      const { consumeWorkflowEventPersisted } = await loadPersistence();
      await expect(consumeWorkflowEventPersisted(envelope, 7)).rejects.toThrow("Banco de dados indisponível.");
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("interrompe replay persistente no receipt duplicate antes de consultar workflows", async () => {
    const { setDbForTesting } = await import("../dbLegacy");
    const calls: string[] = [];
    const tx = {
      select: () => {
        calls.push("receipt:select");
        return {
          from: () => ({
            where: () => ({
              limit: () => ({
                for: async (lock: string) => {
                  calls.push(`receipt:lock:${lock}`);
                  return [{ id: 99 }];
                },
              }),
            }),
          }),
        };
      },
    };
    const db = {
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push("transaction:start");
        const result = await callback(tx);
        calls.push("transaction:end");
        return result;
      },
    };

    setDbForTesting(db as never);
    try {
      const { consumeWorkflowEventPersisted } = await loadPersistence();
      await expect(consumeWorkflowEventPersisted(envelope, 7)).resolves.toEqual({
        status: "duplicate",
        eventId: envelope.eventId,
        executionIds: [],
      });
      expect(calls).toEqual([
        "transaction:start",
        "receipt:select",
        "receipt:lock:update",
        "transaction:end",
      ]);
    } finally {
      setDbForTesting(null);
    }
  });
});
