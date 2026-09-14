import { describe, expect, it } from "vitest";

const contractModulePath = "../shared/workflowIntegration/v1";
const loadContracts = () => import(contractModulePath);

const validEvent = {
  envelopeVersion: "1",
  eventId: "event-0001",
  eventType: "workflow.manual.requested.v1",
  occurredAt: "2026-09-13T10:00:00-03:00",
  tenantId: "tenant-a",
  correlationId: "corr-0001",
  actorUserId: "user-7",
  producer: "axe-dispatch",
  payload: { requestedBy: "manual" },
};

const authorizedExternalEvents = [
  { eventType: "incident.created.v1", producer: "axe-dispatch" },
  { eventType: "incident.status_changed.v1", producer: "axe-dispatch" },
  { eventType: "form.submission.submitted.v1", producer: "d008-forms" },
  { eventType: "form.submission.corrected.v1", producer: "d008-forms" },
  { eventType: "inventory.asset.created.v1", producer: "asset-inventory" },
  { eventType: "inventory.asset.updated.v1", producer: "asset-inventory" },
] as const;

describe("D-012A/D-012F workflow integration contract v1", () => {
  it("publica versões explícitas do contrato e envelope", async () => {
    const contract = await loadContracts();
    expect(contract.WORKFLOW_CONTRACT_VERSION).toBe("v1");
    expect(contract.WORKFLOW_ENVELOPE_VERSION).toBe("1");
  });

  it("aceita eventos internos e externos explicitamente autorizados", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(workflowEventEnvelopeSchema.parse(validEvent)).toEqual(validEvent);

    for (const authorized of authorizedExternalEvents) {
      const envelope = {
        ...validEvent,
        eventId: `event-${authorized.eventType}`,
        eventType: authorized.eventType,
        producer: authorized.producer,
      };
      expect(workflowEventEnvelopeSchema.parse(envelope)).toEqual(envelope);
    }
  });

  it("rejeita combinação produtor/tipo fora da allowlist", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(() => workflowEventEnvelopeSchema.parse({
      ...validEvent,
      eventType: "form.submission.submitted.v1",
      producer: "axe-dispatch",
    })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({
      ...validEvent,
      eventType: "inventory.asset.updated.v1",
      producer: "d008-forms",
    })).toThrow();
  });

  it("falha fechado para versão incompatível, tipo arbitrário e campos arbitrários", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, envelopeVersion: "2" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, eventType: "asset.updated.v1" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, unexpectedField: "x" })).toThrow();
  });

  it("exige identificadores de rastreio válidos", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, eventId: "short" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, correlationId: "short" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, tenantId: "" })).toThrow();
  });
});