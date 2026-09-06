import { describe, expect, it, vi } from "vitest";
import { createFormService, type FormServicePorts } from "./formService";

const definition = {
  schemaVersion: 1 as const,
  title: "Vistoria",
  fields: [{ id: "notes", key: "notes", label: "Observações", type: "short_text" as const, required: false }],
};

function ports(): FormServicePorts {
  return {
    repository: {
      getTemplate: vi.fn(async id => ({ id, tenantId: 7, name: "Vistoria", status: "active" })),
      listTemplates: vi.fn(async () => []),
      getVersion: vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "published", definition })),
      listVersions: vi.fn(async () => []),
      getSubmission: vi.fn(async id => ({ id, tenantId: 7, formId: 3, formVersionId: 5, revision: 3, status: "corrected", answers: { notes: "Corrigido" }, contextType: "incident", contextId: "88" })),
      createDraft: vi.fn(), saveDraft: vi.fn(), publishVersion: vi.fn(), activateForm: vi.fn(), disableForm: vi.fn(),
      createSubmission: vi.fn(), finalizeSubmission: vi.fn(), appendRevision: vi.fn(), bindForm: vi.fn(), createAttachment: vi.fn(),
      listBindings: vi.fn(async () => [{ id: 41, tenantId: 7, formId: 3, formVersionId: 5, contextType: "incident", contextId: "88" }]),
      listSubmissionsForIncident: vi.fn(async () => [{ id: 21, tenantId: 7, formId: 3, formVersionId: 5, status: "corrected", contextType: "incident", contextId: "88" }]),
    },
    audit: { append: vi.fn() },
    events: { append: vi.fn() },
  };
}

describe("D-008 incident submission hydration", () => {
  it("retorna revisão e respostas efetivas calculadas pelo repository", async () => {
    const p = ports();
    const result = await createFormService(7, p).forIncident({ incidentId: "88" });

    expect(p.repository.getSubmission).toHaveBeenCalledWith(21);
    expect(result.submissions).toEqual([
      expect.objectContaining({ id: 21, revision: 3, status: "corrected", answers: { notes: "Corrigido" } }),
    ]);
  });

  it("falha fechado se a submissão listada deixar de existir ou escapar do tenant", async () => {
    const missing = ports();
    missing.repository.getSubmission = vi.fn(async () => null);
    await expect(createFormService(7, missing).forIncident({ incidentId: "88" })).rejects.toThrow(/submissão/i);

    const foreign = ports();
    foreign.repository.getSubmission = vi.fn(async id => ({ id, tenantId: 9, formId: 3, formVersionId: 5, revision: 1, status: "submitted", answers: {} }));
    await expect(createFormService(7, foreign).forIncident({ incidentId: "88" })).rejects.toThrow(/tenant/i);
  });
});
