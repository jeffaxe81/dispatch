import { describe, expect, it } from "vitest";

const adapterModulePath = "./workflowEventAdapters";
const loadAdapters = () => import(adapterModulePath);

describe("D-012F workflow event adapters", () => {
  it("adapta submissão D-008 preservando tenant, eventId e correlationId", async () => {
    const { adaptFormEventToWorkflowEnvelope } = await loadAdapters();
    const envelope = adaptFormEventToWorkflowEnvelope({
      eventId: "form-event-0001",
      eventType: "submission.submitted",
      tenantId: 42,
      aggregateType: "submission",
      aggregateId: "submission-9",
      occurredAt: new Date("2026-09-13T13:00:00.000Z"),
      actorUserId: 7,
      payload: { formId: 3 },
    }, "corr-form-0001");

    expect(envelope).toMatchObject({
      envelopeVersion: "1",
      eventId: "form-event-0001",
      eventType: "form.submission.submitted.v1",
      tenantId: "42",
      correlationId: "corr-form-0001",
      actorUserId: "7",
      producer: "d008-forms",
    });
  });

  it("adapta evento M15 de inventário sem perder correlationId", async () => {
    const { adaptInventoryEventToWorkflowEnvelope } = await loadAdapters();
    const envelope = adaptInventoryEventToWorkflowEnvelope({
      eventId: "asset-event-0001",
      eventType: "asset.updated",
      eventVersion: "1",
      tenantId: "tenant-a",
      assetId: "asset-11",
      assetVersion: 4,
      correlationId: "corr-asset-0001",
      occurredAt: "2026-09-13T13:05:00.000Z",
      payload: { status: "active" },
    });

    expect(envelope).toMatchObject({
      eventId: "asset-event-0001",
      eventType: "inventory.asset.updated.v1",
      tenantId: "tenant-a",
      correlationId: "corr-asset-0001",
      producer: "asset-inventory",
    });
  });

  it("adapta evento do Despacho somente para tipos autorizados", async () => {
    const { adaptDispatchEventToWorkflowEnvelope } = await loadAdapters();
    const envelope = adaptDispatchEventToWorkflowEnvelope({
      eventId: "dispatch-event-0001",
      eventType: "incident.created",
      eventVersion: "1",
      tenantId: "42",
      correlationId: "corr-dispatch-0001",
      occurredAt: "2026-09-13T13:10:00.000Z",
      actorUserId: "7",
      payload: { incidentId: 99 },
    });
    expect(envelope.eventType).toBe("incident.created.v1");
    expect(envelope.producer).toBe("axe-dispatch");

    expect(() => adaptDispatchEventToWorkflowEnvelope({
      eventId: "dispatch-event-0002",
      eventType: "incident.deleted",
      eventVersion: "1",
      tenantId: "42",
      correlationId: "corr-dispatch-0002",
      occurredAt: "2026-09-13T13:10:00.000Z",
      payload: {},
    })).toThrow();
  });

  it("falha fechado para evento D-008 ou Inventário fora da versão/tipo suportado", async () => {
    const { adaptFormEventToWorkflowEnvelope, adaptInventoryEventToWorkflowEnvelope } = await loadAdapters();

    expect(() => adaptFormEventToWorkflowEnvelope({
      eventId: "form-event-0002",
      eventType: "submission.started",
      tenantId: 42,
      aggregateType: "submission",
      aggregateId: "submission-10",
      occurredAt: new Date("2026-09-13T13:00:00.000Z"),
      actorUserId: 7,
      payload: {},
    }, "corr-form-0002")).toThrow();

    expect(() => adaptInventoryEventToWorkflowEnvelope({
      eventId: "asset-event-0002",
      eventType: "asset.updated",
      eventVersion: "2",
      tenantId: "tenant-a",
      assetId: "asset-11",
      assetVersion: 5,
      correlationId: "corr-asset-0002",
      occurredAt: "2026-09-13T13:05:00.000Z",
      payload: {},
    })).toThrow();
  });
});