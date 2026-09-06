import { describe, expect, it, vi } from "vitest";
import { createFormRepository, type FormRepositoryAdapter } from "./formRepository";

function adapter(): FormRepositoryAdapter {
  const passthrough = vi.fn(async input => input);
  return {
    getTemplate: vi.fn(async () => null), listTemplates: vi.fn(async () => []), getVersion: vi.fn(async () => null), listVersions: vi.fn(async () => []), getSubmission: vi.fn(async () => null),
    createDraft: vi.fn(async input => input), saveDraft: vi.fn(async input => input), publishVersion: passthrough, activateForm: passthrough, disableForm: passthrough,
    createBinding: passthrough, createSubmission: vi.fn(async input => input), finalizeSubmission: vi.fn(async input => input), appendRevision: passthrough,
    createAttachment: passthrough, appendDomainEvent: vi.fn(async input => input), listBindings: vi.fn(async () => []), listSubmissionsForIncident: vi.fn(async () => []),
  };
}

describe("D-008 repository tenant override hardening", () => {
  it("remove tenantId não confiável de escritas genéricas", async () => {
    const raw = adapter();
    const repo = createFormRepository(77, raw);

    await repo.saveDraft({ tenantId: 999, versionId: 5, definition: { schemaVersion: 1, title: "F", fields: [] }, actorUserId: 9 } as any);
    await repo.publishVersion({ tenantId: 999, versionId: 5, actorUserId: 9 } as any);
    await repo.activateForm({ tenantId: 999, formId: 3, actorUserId: 9 } as any);
    await repo.disableForm({ tenantId: 999, formId: 3, actorUserId: 9 } as any);
    await repo.appendRevision({ tenantId: 999, submissionId: 21, revision: 2 } as any);
    await repo.createAttachment({ tenantId: 999, submissionId: 21, fieldKey: "foto" } as any);
    await repo.appendDomainEvent({ tenantId: 999, eventId: "evt", eventType: "submission.submitted", aggregateType: "submission", aggregateId: "21", actorUserId: 9, payload: {}, occurredAt: new Date() } as any);

    for (const mock of [raw.saveDraft, raw.publishVersion, raw.activateForm, raw.disableForm, raw.appendRevision, raw.createAttachment, raw.appendDomainEvent] as any[]) {
      expect(mock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77 }));
      expect(mock).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: 999 }));
    }
  });

  it("remove tenantId não confiável de binding", async () => {
    const raw = adapter();
    const repo = createFormRepository(77, raw);
    await repo.bindForm({ tenantId: 999, formId: 3, formVersionId: 5, contextType: "incident", contextId: "88", actorUserId: 9 } as any);
    expect(raw.createBinding).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77, createdByUserId: 9 }));
    expect(raw.createBinding).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: 999 }));
  });
});
