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
          startInstance: async () => {
            calls.push("start");
            return { executionId: 5001 };
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
      "start",
      "complete",
      "transaction:end",
    ]);
  });

  it("expõe o consumer persistente usado pela API de produção", async () => {
    const { consumeWorkflowEventPersisted } = await loadPersistence();
    expect(typeof consumeWorkflowEventPersisted).toBe("function");
  });
});
