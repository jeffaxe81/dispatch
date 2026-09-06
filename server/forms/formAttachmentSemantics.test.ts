import { describe, expect, it, vi } from "vitest";
import { createFormService, type FormServicePorts } from "./formService";

const definition = {
  schemaVersion: 1 as const,
  title: "Vistoria",
  fields: [
    { id: "foto", key: "foto", label: "Foto", type: "image" as const, required: false },
    { id: "doc", key: "doc", label: "Documento", type: "file" as const, required: false },
    { id: "sign", key: "sign", label: "Assinatura", type: "simple_signature" as const, required: false },
  ],
};

function ports(status: "in_progress" | "submitted" | "corrected" = "in_progress"): FormServicePorts {
  return {
    repository: {
      getTemplate: vi.fn(async () => null),
      listTemplates: vi.fn(async () => []),
      getVersion: vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "published" as const, definition })),
      listVersions: vi.fn(async () => []),
      getSubmission: vi.fn(async id => ({ id, tenantId: 7, formId: 3, formVersionId: 5, revision: 1, status, answers: {} })),
      createDraft: vi.fn(),
      createVersion: vi.fn(),
      saveDraft: vi.fn(),
      publishVersion: vi.fn(),
      activateForm: vi.fn(),
      disableForm: vi.fn(),
      createSubmission: vi.fn(),
      finalizeSubmission: vi.fn(),
      appendRevision: vi.fn(),
      bindForm: vi.fn(),
      createAttachment: vi.fn(async input => input),
      listBindings: vi.fn(async () => []),
      listSubmissionsForIncident: vi.fn(async () => []),
    },
    audit: { append: vi.fn(async () => undefined) },
    events: { append: vi.fn(async () => undefined) },
    attachments: {
      store: vi.fn(async input => ({
        storageKey: `tenant/${input.tenantId}/${input.submissionId}/${input.fieldKey}`,
        sha256: "a".repeat(64),
        sizeBytes: input.bytes.byteLength,
        mimeType: input.mimeType,
        fileName: input.fileName,
        kind: input.kind,
        malwareScan: { status: "clean" as const },
      })),
    },
  };
}

const base = {
  submissionId: 21,
  fieldKey: "foto",
  kind: "image" as const,
  fileName: "foto.png",
  mimeType: "image/png",
  bytes: Buffer.from("png"),
  actorUserId: 9,
  now: new Date("2026-09-06T12:00:00Z"),
};

describe("D-008 attachment semantic guard", () => {
  it("aceita anexo somente enquanto a submissão está em preenchimento", async () => {
    const p = ports("submitted");
    await expect(createFormService(7, p).uploadAttachment(base)).rejects.toThrow(/preenchimento/i);
    expect(p.attachments?.store).not.toHaveBeenCalled();
    expect(p.repository.createAttachment).not.toHaveBeenCalled();
  });

  it("rejeita campo inexistente e tipo de anexo incompatível com o schema publicado", async () => {
    const p = ports();
    const service = createFormService(7, p);
    await expect(service.uploadAttachment({ ...base, fieldKey: "inexistente" })).rejects.toThrow(/campo.*anexo|campo.*formulário/i);
    await expect(service.uploadAttachment({ ...base, fieldKey: "foto", kind: "file" })).rejects.toThrow(/incompatível|tipo.*campo/i);
    expect(p.attachments?.store).not.toHaveBeenCalled();
  });

  it("falha fechado quando revisionId é informado sem vínculo de revisão validado", async () => {
    const p = ports();
    await expect(createFormService(7, p).uploadAttachment({ ...base, revisionId: 31 })).rejects.toThrow(/revisão|revision/i);
    expect(p.attachments?.store).not.toHaveBeenCalled();
  });
});
