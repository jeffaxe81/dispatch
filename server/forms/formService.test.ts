import { describe, expect, it, vi } from "vitest";
import { createFormService, type FormServicePorts } from "./formService";

function ports(): FormServicePorts {
  return {
    repository: {
      getTemplate: vi.fn(async id => ({ id, tenantId: 7, status: "draft" as const })),
      getVersion: vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "draft" as const, definition: { schemaVersion: 1, title: "F", fields: [] } })),
      publishVersion: vi.fn(async input => input),
      createSubmission: vi.fn(async input => ({ id: 21, ...input })),
      appendRevision: vi.fn(async input => ({ id: 31, ...input })),
    },
    audit: { append: vi.fn(async () => undefined) },
    events: { append: vi.fn(async () => undefined) },
  };
}

describe("D-008 application service", () => {
  it("publica formulário com auditoria e evento", async () => {
    const p = ports();
    const service = createFormService(7, p);
    await service.publishFormVersion({ versionId: 5, actorUserId: 9, now: new Date("2026-09-05T15:00:00Z") });
    expect(p.repository.publishVersion).toHaveBeenCalled();
    expect(p.audit.append).toHaveBeenCalledWith(expect.objectContaining({ resourceType: "form_version", action: "publish" }));
    expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: "form.published", tenantId: 7 }));
  });

  it("submissão não executa transição de ocorrência", async () => {
    const p = ports();
    const service = createFormService(7, p);
    const result = await service.submitForm({ formId: 3, formVersionId: 5, actorUserId: 9, answers: {}, now: new Date() });
    expect(result.incidentTransitionRequested).toBe(false);
    expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: "submission.submitted" }));
  });
});
