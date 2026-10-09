import { describe, expect, it } from "vitest";
import { adaptFormEventToWorkflowEnvelope } from "./workflowEventAdapters";
import {
  readWorkflowFormEvidence,
  workflowFormEvidenceFromEnvelope,
  writeWorkflowFormEvidence,
} from "./workflowFormEventEvidence";

describe("D-012H H4 — evidência por evento D-008", () => {
  it("normaliza submission.submitted sem transportar respostas", () => {
    const envelope = adaptFormEventToWorkflowEnvelope({
      eventId: "form-event-submitted-44",
      eventType: "submission.submitted",
      tenantId: 7,
      aggregateType: "submission",
      aggregateId: "44",
      occurredAt: new Date("2026-09-27T12:00:00-03:00"),
      actorUserId: 5,
      payload: { formId: 10, formVersionId: 25 },
    }, "corr-d012h-h4");

    expect(workflowFormEvidenceFromEnvelope(envelope)).toEqual({
      submissionId: 44,
      formId: 10,
      formVersionId: 25,
      status: "submitted",
    });
    expect(envelope.payload).not.toHaveProperty("answers");
  });

  it("normaliza submission.corrected com a mesma referência congelada", () => {
    const envelope = adaptFormEventToWorkflowEnvelope({
      eventId: "form-event-corrected-44",
      eventType: "submission.corrected",
      tenantId: 7,
      aggregateType: "submission",
      aggregateId: "44",
      occurredAt: new Date("2026-09-27T12:01:00-03:00"),
      actorUserId: 5,
      payload: { formId: 10, formVersionId: 25, revision: 2 },
    }, "corr-d012h-h4-corrected");

    expect(workflowFormEvidenceFromEnvelope(envelope)).toEqual({
      submissionId: 44,
      formId: 10,
      formVersionId: 25,
      status: "corrected",
    });
  });

  it("falha fechado para produtor, evento ou identificador incompatível", () => {
    const valid = adaptFormEventToWorkflowEnvelope({
      eventId: "form-event-submitted-45",
      eventType: "submission.submitted",
      tenantId: 7,
      aggregateType: "submission",
      aggregateId: "45",
      occurredAt: new Date("2026-09-27T12:02:00-03:00"),
      actorUserId: 5,
      payload: { formId: 10, formVersionId: 25 },
    }, "corr-d012h-h4-invalid");

    expect(() => workflowFormEvidenceFromEnvelope({
      ...valid,
      producer: "workflow-engine",
    })).toThrow(/produtor|D-008|evento/i);
    expect(() => workflowFormEvidenceFromEnvelope({
      ...valid,
      payload: { ...valid.payload, formVersionId: 0 },
    })).toThrow(/form|versão|evidência|inválid/i);
  });

  it("persiste somente evidência mínima por nodeId sem destruir output existente", () => {
    const evidence = {
      submissionId: 44,
      formId: 10,
      formVersionId: 25,
      status: "submitted",
    } as const;
    const output = writeWorkflowFormEvidence({ existing: "ok" }, "form-1", evidence);

    expect(output.existing).toBe("ok");
    expect(readWorkflowFormEvidence(output, "form-1")).toEqual(evidence);
    expect(output).not.toHaveProperty("answers");
  });
});
