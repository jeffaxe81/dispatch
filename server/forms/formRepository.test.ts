import { describe, expect, it, vi } from "vitest";
import { createFormRepository, type FormRepositoryAdapter } from "./formRepository";

function adapter(): FormRepositoryAdapter {
  return {
    getTemplate: vi.fn(async input => ({ id: input.id, tenantId: input.tenantId, status: "draft" as const })),
    listTemplates: vi.fn(async input => [{ id: 1, tenantId: input.tenantId, status: "draft" as const }]),
    getVersion: vi.fn(async input => ({ id: input.id, tenantId: input.tenantId, formId: 1, version: 1, status: "draft" as const })),
    listVersions: vi.fn(async () => []),
    getSubmission: vi.fn(async input => ({ id: input.id, tenantId: input.tenantId, formId: 1, formVersionId: 2, revision: 1, status: "submitted" as const, answers: {} })),
    createDraft: vi.fn(async input => ({ id: 1, ...input })),
    saveDraft: vi.fn(async input => input),
    publishVersion: vi.fn(async input => input),
    disableForm: vi.fn(async input => input),
    createBinding: vi.fn(async input => ({ id: 10, ...input })),
    createSubmission: vi.fn(async input => ({ id: 1, ...input })),
    appendRevision: vi.fn(async input => ({ id: 1, ...input })),
    createAttachment: vi.fn(async input => ({ id: 1, ...input })),
    appendDomainEvent: vi.fn(async input => ({ id: 1, ...input })),
    listBindings: vi.fn(async () => []),
    listSubmissionsForIncident: vi.fn(async () => []),
  };
}

describe("D-008 repository tenant boundary", () => {
  it("injeta tenantId em leituras e escritas", async () => {
    const raw = adapter(); const repo = createFormRepository(77, raw);
    await repo.getTemplate(9); await repo.createDraft({ code: "vistoria", name: "Vistoria", createdByUserId: 3 });
    expect(raw.getTemplate).toHaveBeenCalledWith({ tenantId: 77, id: 9 });
    expect(raw.createDraft).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77 }));
  });

  it("rejeita resultado devolvido por outro tenant", async () => {
    const raw = adapter(); raw.getTemplate = vi.fn(async () => ({ id: 9, tenantId: 88, status: "draft" as const }));
    await expect(createFormRepository(77, raw).getTemplate(9)).rejects.toThrow(/tenant/i);
  });

  it("não permite que o chamador sobrescreva tenantId", async () => {
    const raw = adapter(); const repo = createFormRepository(77, raw);
    await repo.createSubmission({ formId: 1, formVersionId: 2, createdByUserId: 3, answers: {} });
    expect(raw.createSubmission).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77 }));
  });

  it("cobre as sete estruturas persistentes do D-008", async () => {
    const raw = adapter(); const repo = createFormRepository(77, raw);
    await repo.createBinding({ formId: 3, formVersionId: 5, contextType: "incident", contextId: "42", createdByUserId: 9 });
    await repo.getSubmission(21);
    await repo.createAttachment({ submissionId: 21, fieldKey: "foto", kind: "image", storageKey: "k", fileName: "a.png", mimeType: "image/png", sizeBytes: 1, sha256: "a".repeat(64), createdByUserId: 9 });
    await repo.appendDomainEvent({ eventId: "evt-1", eventType: "submission.submitted", aggregateType: "submission", aggregateId: "21", actorUserId: 9, payload: {}, occurredAt: new Date() });
    expect(raw.createBinding).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77, contextType: "incident" }));
    expect(raw.getSubmission).toHaveBeenCalledWith({ tenantId: 77, id: 21 });
    expect(raw.createAttachment).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77, kind: "image" }));
    expect(raw.appendDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77, eventId: "evt-1" }));
  });

  it("desativa sem expor exclusão física de formulário", async () => {
    const raw = adapter(); const repo = createFormRepository(77, raw);
    await repo.disableForm({ formId: 3, actorUserId: 9, disabledAt: new Date() });
    expect(raw.disableForm).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77, formId: 3 }));
    expect("deleteForm" in repo).toBe(false);
  });
});
