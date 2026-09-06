import { describe, expect, it, vi } from "vitest";
import { createFormService, type FormServicePorts } from "./formService";

const definition = {
  schemaVersion: 1 as const,
  title: "Vistoria",
  fields: [
    { id: "foto", key: "foto", label: "Foto", type: "image" as const, required: true },
  ],
};

function makePorts(attachments: Array<{ fieldKey: string; fileName: string; kind: string }> = []): FormServicePorts {
  const repository: any = {
    getTemplate: vi.fn(async () => null),
    listTemplates: vi.fn(async () => []),
    getVersion: vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "published", definition })),
    listVersions: vi.fn(async () => []),
    getSubmission: vi.fn(async id => ({
      id,
      tenantId: 7,
      formId: 3,
      formVersionId: 5,
      revision: 1,
      status: "in_progress",
      answers: {},
      attachments,
    })),
    createDraft: vi.fn(),
    createVersion: vi.fn(),
    saveDraft: vi.fn(),
    publishVersion: vi.fn(),
    activateForm: vi.fn(),
    disableForm: vi.fn(),
    createSubmission: vi.fn(async input => ({ id: 21, ...input })),
    finalizeSubmission: vi.fn(async input => input),
    appendRevision: vi.fn(async input => input),
    bindForm: vi.fn(),
    createAttachment: vi.fn(),
    listBindings: vi.fn(async () => []),
    listSubmissionsForIncident: vi.fn(async () => []),
  };
  return {
    repository,
    audit: { append: vi.fn(async () => undefined) },
    events: { append: vi.fn(async () => undefined) },
  };
}

const submitBase = {
  submissionId: 21,
  formId: 3,
  formVersionId: 5,
  answers: { foto: "fake.png" },
  actorUserId: 9,
  now: new Date("2026-09-06T12:00:00Z"),
};

describe("D-008 attachment answer integrity", () => {
  it("não aceita nome de arquivo no JSON sem anexo persistido da submissão", async () => {
    const p = makePorts([]);
    await expect(createFormService(7, p).submitForm(submitBase)).rejects.toThrow(/obrigatório|anexo/i);
    expect(p.repository.finalizeSubmission).not.toHaveBeenCalled();
  });

  it("materializa a resposta de anexo a partir do metadado persistido, ignorando nome enviado pelo cliente", async () => {
    const p = makePorts([{ fieldKey: "foto", fileName: "real.png", kind: "image" }]);
    await createFormService(7, p).submitForm(submitBase);
    expect(p.repository.finalizeSubmission).toHaveBeenCalledWith(expect.objectContaining({ answers: { foto: "real.png" } }));
  });

  it("preserva anexo persistido durante correção e ignora tentativa de trocar referência via JSON", async () => {
    const p = makePorts([{ fieldKey: "foto", fileName: "real.png", kind: "image" }]);
    p.repository.getSubmission = vi.fn(async (id: number) => ({
      id,
      tenantId: 7,
      formId: 3,
      formVersionId: 5,
      revision: 1,
      status: "submitted",
      answers: { foto: "real.png" },
      attachments: [{ fieldKey: "foto", fileName: "real.png", kind: "image" }],
    }));
    await createFormService(7, p).correctSubmission({ submissionId: 21, answers: { foto: "fake.png" }, reason: "ajuste", actorUserId: 9, now: new Date() });
    expect(p.repository.appendRevision).toHaveBeenCalledWith(expect.objectContaining({ answers: { foto: "real.png" } }));
  });
});
