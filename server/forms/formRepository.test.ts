import { describe, expect, it, vi } from "vitest";
import { createFormRepository, type FormRepositoryAdapter } from "./formRepository";

function adapter(): FormRepositoryAdapter {
  return {
    getTemplate: vi.fn(async input => ({ id: input.id, tenantId: input.tenantId, status: "draft" as const })),
    listTemplates: vi.fn(async input => [{ id: 1, tenantId: input.tenantId, status: "draft" as const }]),
    getVersion: vi.fn(async input => ({ id: input.id, tenantId: input.tenantId, formId: 1, version: 1, status: "draft" as const })),
    listVersions: vi.fn(async () => []),
    createDraft: vi.fn(async input => ({ id: 1, ...input })),
    saveDraft: vi.fn(async input => input),
    publishVersion: vi.fn(async input => input),
    createSubmission: vi.fn(async input => ({ id: 1, ...input })),
    appendRevision: vi.fn(async input => ({ id: 1, ...input })),
    listBindings: vi.fn(async () => []),
    listSubmissionsForIncident: vi.fn(async () => []),
  };
}

describe("D-008 repository tenant boundary", () => {
  it("injeta tenantId em leituras e escritas", async () => {
    const raw = adapter();
    const repo = createFormRepository(77, raw);
    await repo.getTemplate(9);
    await repo.createDraft({ code: "vistoria", name: "Vistoria", createdByUserId: 3 });
    expect(raw.getTemplate).toHaveBeenCalledWith({ tenantId: 77, id: 9 });
    expect(raw.createDraft).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77 }));
  });

  it("rejeita resultado devolvido por outro tenant", async () => {
    const raw = adapter();
    raw.getTemplate = vi.fn(async () => ({ id: 9, tenantId: 88, status: "draft" as const }));
    const repo = createFormRepository(77, raw);
    await expect(repo.getTemplate(9)).rejects.toThrow(/tenant/i);
  });

  it("não permite que o chamador sobrescreva tenantId", async () => {
    const raw = adapter();
    const repo = createFormRepository(77, raw);
    await repo.createSubmission({ formId: 1, formVersionId: 2, createdByUserId: 3, answers: {} });
    expect(raw.createSubmission).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 77 }));
  });

  it("cria binding tenant-aware preservando contexto e versão publicada", async () => {
    const raw = adapter();
    const createBinding = vi.fn(async (input: unknown) => ({ id: 10, ...(input as object) }));
    (raw as FormRepositoryAdapter & { createBinding: typeof createBinding }).createBinding = createBinding;
    const repo = createFormRepository(77, raw);

    await (repo as typeof repo & { createBinding(input: { formId: number; formVersionId: number; contextType: "occurrence"; contextId: string; createdByUserId: number }): Promise<unknown> }).createBinding({
      formId: 3,
      formVersionId: 5,
      contextType: "occurrence",
      contextId: "INC-42",
      createdByUserId: 9,
    });

    expect(createBinding).toHaveBeenCalledWith({
      tenantId: 77,
      formId: 3,
      formVersionId: 5,
      contextType: "occurrence",
      contextId: "INC-42",
      createdByUserId: 9,
    });
  });
});