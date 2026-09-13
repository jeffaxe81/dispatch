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

describe("D-012A workflow integration contract v1", () => {
  it("publica versões explícitas do contrato e envelope", async () => {
    const contract = await loadContracts();
    expect(contract.WORKFLOW_CONTRACT_VERSION).toBe("v1");
    expect(contract.WORKFLOW_ENVELOPE_VERSION).toBe("1");
  });

  it("aceita somente os eventos internos inicialmente autorizados", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(workflowEventEnvelopeSchema.parse(validEvent)).toEqual(validEvent);
    expect(() => workflowEventEnvelopeSchema.parse({
      ...validEvent,
      eventType: "asset.updated.v1",
    })).toThrow();
  });

  it("falha fechado para versão incompatível e campos arbitrários", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, envelopeVersion: "2" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, script: "return true" })).toThrow();
  });

  it("exige identificadores de rastreio válidos", async () => {
    const { workflowEventEnvelopeSchema } = await loadContracts();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, eventId: "short" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, correlationId: "short" })).toThrow();
    expect(() => workflowEventEnvelopeSchema.parse({ ...validEvent, tenantId: "" })).toThrow();
  });
});
