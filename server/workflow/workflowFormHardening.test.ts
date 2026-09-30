import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adaptFormEventToWorkflowEnvelope } from "./workflowEventAdapters";
import { writeWorkflowFormEvidence } from "./workflowFormEventEvidence";

const modulePath = "./workflowFormPersistence";
const loadModule = () => import(modulePath);

function envelope(eventType: "submission.submitted" | "submission.corrected" = "submission.submitted") {
  return adaptFormEventToWorkflowEnvelope({
    eventId: `form-hardening-${eventType}-44`,
    eventType,
    tenantId: 7,
    aggregateType: "submission",
    aggregateId: "44",
    occurredAt: new Date(eventType === "submission.submitted"
      ? "2026-09-27T13:00:00-03:00"
      : "2026-09-27T13:01:00-03:00"),
    actorUserId: 5,
    payload: {
      formId: 10,
      formVersionId: 25,
      ...(eventType === "submission.corrected" ? { revision: 2 } : {}),
    },
  }, "corr-form-hardening-0001");
}

function baseCandidate(outputData: unknown = null) {
  return {
    executionId: 501,
    nodeId: "form-1",
    outputData,
    policy: "required_before_transition" as const,
  };
}

describe("D-012H H5 — hardening de formulário", () => {
  it("usa receipt persistente para impedir replay mesmo após a instância avançar", async () => {
    const { createWorkflowFormEvidencePersistence } = await loadModule();
    const calls: string[] = [];
    const persistence = createWorkflowFormEvidencePersistence({
      transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({}),
      findCandidates: async () => {
        calls.push("find");
        return [baseCandidate()];
      },
      claimReceipt: async () => {
        calls.push("claim");
        return { status: "duplicate" as const, tenantId: "7", eventId: envelope().eventId };
      },
      persistEvidence: async () => { calls.push("persist"); },
      auditEvidence: async () => { calls.push("audit"); },
      afterPersist: async () => { calls.push("resume"); },
      completeReceipt: async () => { calls.push("complete"); },
    } as any);

    await expect(persistence.consume(envelope(), 5)).resolves.toEqual({
      status: "duplicate",
      executionId: 501,
      nodeId: "form-1",
    });
    expect(calls).toEqual(["find", "claim"]);
  });

  it("fecha receipt como processed somente depois de persistir, auditar e aplicar o gate", async () => {
    const { createWorkflowFormEvidencePersistence } = await loadModule();
    const calls: string[] = [];
    const persistence = createWorkflowFormEvidencePersistence({
      transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({}),
      findCandidates: async () => {
        calls.push("find");
        return [baseCandidate()];
      },
      claimReceipt: async () => {
        calls.push("claim");
        return { status: "claimed" as const, tenantId: "7", eventId: envelope().eventId };
      },
      persistEvidence: async () => { calls.push("persist"); },
      auditEvidence: async () => { calls.push("audit"); },
      afterPersist: async () => { calls.push("resume"); },
      completeReceipt: async (_tx: object, input: Record<string, unknown>) => {
        calls.push("complete");
        expect(input).toEqual(expect.objectContaining({
          tenantId: "7",
          eventId: envelope().eventId,
          status: "processed",
          workflowExecutionId: 501,
        }));
      },
    } as any);

    await expect(persistence.consume(envelope(), 5)).resolves.toMatchObject({
      status: "processed",
      executionId: 501,
    });
    expect(calls).toEqual(["find", "claim", "persist", "audit", "resume", "complete"]);
  });

  it("não permite substituir a evidência por outra submissão na mesma etapa", async () => {
    const { createWorkflowFormEvidencePersistence } = await loadModule();
    const existing = writeWorkflowFormEvidence({}, "form-1", {
      submissionId: 99,
      formId: 10,
      formVersionId: 25,
      status: "submitted",
    });
    let writes = 0;
    const persistence = createWorkflowFormEvidencePersistence({
      transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({}),
      findCandidates: async () => [baseCandidate(existing)],
      persistEvidence: async () => { writes += 1; },
      auditEvidence: async () => {},
    });

    await expect(persistence.consume(envelope(), 5)).rejects.toThrow(/submissão|evidência|vinculad/i);
    expect(writes).toBe(0);
  });

  it("não rebaixa corrected para submitted por evento atrasado", async () => {
    const { createWorkflowFormEvidencePersistence } = await loadModule();
    const existing = writeWorkflowFormEvidence({}, "form-1", {
      submissionId: 44,
      formId: 10,
      formVersionId: 25,
      status: "corrected",
    });
    let writes = 0;
    const persistence = createWorkflowFormEvidencePersistence({
      transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({}),
      findCandidates: async () => [baseCandidate(existing)],
      persistEvidence: async () => { writes += 1; },
      auditEvidence: async () => {},
    });

    await expect(persistence.consume(envelope("submission.submitted"), 5)).rejects.toThrow(/atrasad|downgrade|corrected|submitted/i);
    expect(writes).toBe(0);
  });

  it("mantém a fronteira sem importar banco/repositório interno do D-008", () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "workflowFormPersistence.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/formsSchema|formRepository|\.\.\/forms\//);
    expect(source).toContain("workflowExecutionTenantScopes");
    expect(source).toContain("correlationId");
  });
});
