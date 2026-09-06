import { describe, expect, it, vi } from "vitest";
import { createFormService, type FormServicePorts } from "./formService";

const publishedDefinition = { schemaVersion: 1 as const, title: "Vistoria", fields: [{ id: "notes", key: "notes", label: "Observações", type: "short_text" as const, required: true }] };

function ports(): FormServicePorts {
  return {
    repository: {
      getTemplate: vi.fn(async id => ({ id, tenantId: 7, status: "draft" as const })),
      getVersion: vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "draft" as const, definition: { schemaVersion: 1, title: "F", fields: [] } })),
      getSubmission: vi.fn(async id => ({ id, tenantId: 7, formId: 3, formVersionId: 5, revision: 1, answers: { notes: "Antes" } })),
      publishVersion: vi.fn(async input => input),
      disableForm: vi.fn(async input => input),
      createSubmission: vi.fn(async input => ({ id: 21, ...input })),
      appendRevision: vi.fn(async input => ({ id: 31, ...input })),
      bindForm: vi.fn(async input => ({ id: 41, ...input })),
    },
    audit: { append: vi.fn(async () => undefined) },
    events: { append: vi.fn(async () => undefined) },
  };
}

describe("D-008 application service", () => {
  it("publica formulário com auditoria e evento", async () => {
    const p = ports(); const service = createFormService(7, p);
    await service.publishFormVersion({ versionId: 5, actorUserId: 9, now: new Date("2026-09-05T15:00:00Z") });
    expect(p.repository.publishVersion).toHaveBeenCalled();
    expect(p.audit.append).toHaveBeenCalledWith(expect.objectContaining({ resourceType: "form_version", action: "publish" }));
    expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: "form.published", tenantId: 7 }));
  });

  it("submissão não executa transição de ocorrência", async () => {
    const p = ports(); p.repository.getVersion = vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "published" as const, definition: publishedDefinition }));
    const result = await createFormService(7, p).submitForm({ formId: 3, formVersionId: 5, actorUserId: 9, answers: { notes: "Tudo certo" }, now: new Date() });
    expect(result.incidentTransitionRequested).toBe(false);
    expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: "submission.submitted" }));
  });

  it("valida respostas contra a versão publicada antes de persistir", async () => {
    const p = ports(); p.repository.getVersion = vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "published" as const, definition: publishedDefinition }));
    await expect(createFormService(7, p).submitForm({ formId: 3, formVersionId: 5, actorUserId: 9, answers: {}, now: new Date() })).rejects.toThrow(/resposta|obrigat/i);
    expect(p.repository.createSubmission).not.toHaveBeenCalled();
  });

  it("corrige por nova revisão, exige motivo e emite auditoria/evento", async () => {
    const p = ports(); p.repository.getVersion = vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "published" as const, definition: publishedDefinition }));
    const service = createFormService(7, p);
    await expect(service.correctSubmission({ submissionId: 21, actorUserId: 9, answers: { notes: "Depois" }, reason: " ", now: new Date() })).rejects.toThrow(/motivo|justific/i);
    await service.correctSubmission({ submissionId: 21, actorUserId: 9, answers: { notes: "Depois" }, reason: "Correção conferida", now: new Date() });
    expect(p.repository.appendRevision).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, reason: "Correção conferida" }));
    expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: "submission.corrected" }));
  });

  it("desativa formulário sem apagar histórico", async () => {
    const p = ports(); p.repository.getTemplate = vi.fn(async id => ({ id, tenantId: 7, status: "published" as const }));
    await createFormService(7, p).disableForm({ formId: 3, actorUserId: 9, now: new Date() });
    expect(p.repository.disableForm).toHaveBeenCalledWith(expect.objectContaining({ formId: 3 }));
    expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: "form.disabled" }));
  });

  it("cria binding operacional auditável sem transição automática", async () => {
    const p = ports();
    const result = await createFormService(7, p).bindForm({ formId: 3, contextType: "incident", contextId: "88", actorUserId: 9, now: new Date() });
    expect(p.repository.bindForm).toHaveBeenCalledWith(expect.objectContaining({ formId: 3, contextType: "incident", contextId: "88" }));
    expect(result.incidentTransitionRequested).toBe(false);
  });
});
