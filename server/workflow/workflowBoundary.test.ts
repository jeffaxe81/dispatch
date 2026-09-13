import { describe, expect, it } from "vitest";
import {
  buildWorkflowIdempotencyKey,
  parseTrustedWorkflowEvent,
  WorkflowBoundaryError,
} from "./workflowBoundary";

const validEvent = {
  envelopeVersion: "1",
  eventId: "event-0001",
  eventType: "workflow.manual.requested.v1",
  occurredAt: "2026-09-13T10:00:00-03:00",
  tenantId: "tenant-a",
  correlationId: "corr-0001",
  actorUserId: "user-7",
  producer: "axe-dispatch",
  payload: {},
};

describe("D-012A trusted workflow boundary", () => {
  it("aceita evento válido somente quando o tenant coincide com o contexto confiável", () => {
    expect(parseTrustedWorkflowEvent(validEvent, "tenant-a")).toEqual(validEvent);
  });

  it("falha fechado quando o tenant do envelope diverge", () => {
    expect(() => parseTrustedWorkflowEvent(validEvent, "tenant-b")).toThrowError(
      expect.objectContaining<Partial<WorkflowBoundaryError>>({ code: "workflow_tenant_mismatch" }),
    );
  });

  it("classifica envelope inválido sem vazar detalhes internos", () => {
    expect(() => parseTrustedWorkflowEvent({ ...validEvent, envelopeVersion: "2" }, "tenant-a")).toThrowError(
      expect.objectContaining<Partial<WorkflowBoundaryError>>({ code: "workflow_event_invalid" }),
    );
  });

  it("gera idempotência determinística e isolada por tenant", () => {
    expect(buildWorkflowIdempotencyKey(validEvent)).toBe("tenant-a:event-0001");
    expect(buildWorkflowIdempotencyKey({ ...validEvent, tenantId: "tenant-b" })).toBe("tenant-b:event-0001");
  });

  it("evita colisão por separadores presentes nos identificadores", () => {
    const first = buildWorkflowIdempotencyKey({ tenantId: "tenant:a", eventId: "event/1" });
    const second = buildWorkflowIdempotencyKey({ tenantId: "tenant", eventId: "a:event/1" });
    expect(first).not.toBe(second);
    expect(first).toBe("tenant%3Aa:event%2F1");
  });
});
