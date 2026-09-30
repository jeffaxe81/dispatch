import { describe, expect, it } from "vitest";
import { adaptFormEventToWorkflowEnvelope } from "./workflowEventAdapters";

const modulePath = "./workflowFormPersistence";
const loadModule = () => import(modulePath);

function submittedEnvelope() {
  return adaptFormEventToWorkflowEnvelope({
    eventId: "form-event-persist-44",
    eventType: "submission.submitted",
    tenantId: 7,
    aggregateType: "submission",
    aggregateId: "44",
    occurredAt: new Date("2026-09-27T12:10:00-03:00"),
    actorUserId: 5,
    payload: { formId: 10, formVersionId: 25 },
  }, "corr-workflow-form-0001");
}

describe("D-012H H4-B — persistência de evidência D-008", () => {
  it("persiste exatamente uma evidência correlacionada no mesmo tenant", async () => {
    const { createWorkflowFormEvidencePersistence } = await loadModule();
    const writes: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];
    const tx = { id: "tx-form-evidence" };

    const persistence = createWorkflowFormEvidencePersistence({
      transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
      findCandidates: async (transaction: typeof tx, input: Record<string, unknown>) => {
        expect(transaction).toBe(tx);
        expect(input).toEqual(expect.objectContaining({
          organizationId: 7,
          correlationId: "corr-workflow-form-0001",
          formId: 10,
          formVersionId: 25,
        }));
        return [{
          executionId: 501,
          nodeId: "form-1",
          outputData: { existing: "ok" },
        }];
      },
      persistEvidence: async (transaction: typeof tx, input: Record<string, unknown>) => {
        expect(transaction).toBe(tx);
        writes.push(input);
      },
      auditEvidence: async (transaction: typeof tx, input: Record<string, unknown>) => {
        expect(transaction).toBe(tx);
        audits.push(input);
      },
    });

    await expect(persistence.consume(submittedEnvelope(), 5)).resolves.toEqual({
      status: "processed",
      executionId: 501,
      nodeId: "form-1",
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(expect.objectContaining({
      executionId: 501,
      nodeId: "form-1",
      evidence: {
        submissionId: 44,
        formId: 10,
        formVersionId: 25,
        status: "submitted",
      },
    }));
    expect(audits).toHaveLength(1);
  });

  it("falha fechado quando a mesma correlação encontra mais de uma instância", async () => {
    const { createWorkflowFormEvidencePersistence } = await loadModule();
    const persistence = createWorkflowFormEvidencePersistence({
      transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({}),
      findCandidates: async () => [
        { executionId: 501, nodeId: "form-1", outputData: null },
        { executionId: 502, nodeId: "form-1", outputData: null },
      ],
      persistEvidence: async () => { throw new Error("não deveria persistir"); },
      auditEvidence: async () => { throw new Error("não deveria auditar"); },
    });

    await expect(persistence.consume(submittedEnvelope(), 5)).rejects.toThrow(/ambígu|mais de uma|correlação/i);
  });

  it("trata replay da mesma evidência como duplicate sem nova escrita", async () => {
    const { createWorkflowFormEvidencePersistence } = await loadModule();
    const { writeWorkflowFormEvidence } = await import("./workflowFormEventEvidence");
    const outputData = writeWorkflowFormEvidence({}, "form-1", {
      submissionId: 44,
      formId: 10,
      formVersionId: 25,
      status: "submitted",
    });
    let writes = 0;
    let audits = 0;

    const persistence = createWorkflowFormEvidencePersistence({
      transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({}),
      findCandidates: async () => [{ executionId: 501, nodeId: "form-1", outputData }],
      persistEvidence: async () => { writes += 1; },
      auditEvidence: async () => { audits += 1; },
    });

    await expect(persistence.consume(submittedEnvelope(), 5)).resolves.toEqual({
      status: "duplicate",
      executionId: 501,
      nodeId: "form-1",
    });
    expect(writes).toBe(0);
    expect(audits).toBe(0);
  });

  it("expõe consumer persistente de produção", async () => {
    const { consumeWorkflowFormEvidencePersisted } = await loadModule();
    expect(typeof consumeWorkflowFormEvidencePersisted).toBe("function");
  });
});
