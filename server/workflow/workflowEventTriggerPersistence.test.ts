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

  it("expõe o consumer persistente usado pela API de produção", async () => {
    const { consumeWorkflowEventPersisted } = await loadPersistence();
    expect(typeof consumeWorkflowEventPersisted).toBe("function");
  });
});
