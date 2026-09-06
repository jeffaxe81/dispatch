import { describe, expect, it, vi } from "vitest";
import { createFormService, type FormServicePorts } from "./formService";

const publishedDefinition = { schemaVersion: 1 as const, title: "Vistoria", fields: [{ id: "notes", key: "notes", label: "Observações", type: "short_text" as const, required: true }] };

function ports(): FormServicePorts {
  return {
    repository: {
      getTemplate: vi.fn(async id => ({ id, tenantId: 7, status: "draft" as const })),
      getVersion: vi.fn(async id => ({ id, tenantId: 7, formId: 3, version: 1, status: "draft" as const, definition: { schemaVersion: 1, title: "F", fields: [] } })),
      getSubmission: vi.fn(async id => ({ id, tenantId: 7, formId: 3, formVersionId: 5, revision: 1, status: "submitted" as const, answers: { notes: "Antes" } })),
      publishVersion: vi.fn(async input => input), activateForm: vi.fn(async input => input), disableForm: vi.fn(async input => input),
      createSubmission: vi.fn(async input => ({ id: 21, ...input })), appendRevision: vi.fn(async input => ({ id: 31, ...input })), bindForm: vi.fn(async input => ({ id: 41, ...input })),
    }, audit: { append: vi.fn(async () => undefined) }, events: { append: vi.fn(async () => undefined) },
  };
}

describe("D-008 application service", () => {
  it("publica versão e ativa template com auditoria e evento", async () => { const p=ports(); const result=await createFormService(7,p).publishFormVersion({versionId:5,actorUserId:9,now:new Date("2026-09-05T15:00:00Z")}); expect(p.repository.publishVersion).toHaveBeenCalled(); expect(p.repository.activateForm).toHaveBeenCalledWith(expect.objectContaining({formId:3})); expect(result).toEqual(expect.objectContaining({versionId:5,versionStatus:"published",templateStatus:"active"})); expect(p.audit.append).toHaveBeenCalledWith(expect.objectContaining({resourceType:"form_version",action:"publish"})); expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({eventType:"form.published",tenantId:7})); });

  it("inicia submissão somente em versão publicada, sem marcar envio", async () => {
    const p=ports(); p.repository.getVersion=vi.fn(async id=>({id,tenantId:7,formId:3,version:1,status:"published" as const,definition:publishedDefinition}));
    const now=new Date("2026-09-05T20:30:00Z"); const result=await createFormService(7,p).startSubmission({formId:3,formVersionId:5,actorUserId:9,now});
    expect(p.repository.createSubmission).toHaveBeenCalledWith(expect.objectContaining({formId:3,formVersionId:5,status:"in_progress",answers:{}}));
    expect(p.repository.createSubmission).not.toHaveBeenCalledWith(expect.objectContaining({status:"submitted"}));
    expect(p.audit.append).toHaveBeenCalledWith(expect.objectContaining({action:"start",after:expect.objectContaining({status:"in_progress"})}));
    expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({eventType:"submission.started"}));
    expect(result).toEqual(expect.objectContaining({status:"in_progress",incidentTransitionRequested:false}));
  });

  it("rejeita início de submissão para versão não publicada ou fora do tenant/formulário", async () => {
    const p=ports(); const service=createFormService(7,p);
    await expect(service.startSubmission({formId:3,formVersionId:5,actorUserId:9,now:new Date()})).rejects.toThrow(/publicada/i);
    p.repository.getVersion=vi.fn(async id=>({id,tenantId:8,formId:4,version:1,status:"published" as const,definition:publishedDefinition}));
    await expect(service.startSubmission({formId:3,formVersionId:5,actorUserId:9,now:new Date()})).rejects.toThrow(/formulário|tenant/i);
    expect(p.repository.createSubmission).not.toHaveBeenCalled();
  });

  it("submissão usa status aprovado e não executa transição de ocorrência", async () => { const p=ports(); p.repository.getVersion=vi.fn(async id=>({id,tenantId:7,formId:3,version:1,status:"published" as const,definition:publishedDefinition})); const result=await createFormService(7,p).submitForm({formId:3,formVersionId:5,actorUserId:9,answers:{notes:"Tudo certo"},now:new Date()}); expect(p.repository.createSubmission).toHaveBeenCalledWith(expect.objectContaining({status:"submitted"})); expect(result.incidentTransitionRequested).toBe(false); expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({eventType:"submission.submitted"})); });
  it("valida respostas contra a versão publicada antes de persistir", async () => { const p=ports(); p.repository.getVersion=vi.fn(async id=>({id,tenantId:7,formId:3,version:1,status:"published" as const,definition:publishedDefinition})); await expect(createFormService(7,p).submitForm({formId:3,formVersionId:5,actorUserId:9,answers:{},now:new Date()})).rejects.toThrow(/resposta|obrigat/i); expect(p.repository.createSubmission).not.toHaveBeenCalled(); });
  it("corrige por nova revisão, exige motivo e marca submissão corrected", async () => { const p=ports(); p.repository.getVersion=vi.fn(async id=>({id,tenantId:7,formId:3,version:1,status:"published" as const,definition:publishedDefinition})); const service=createFormService(7,p); await expect(service.correctSubmission({submissionId:21,actorUserId:9,answers:{notes:"Depois"},reason:" ",now:new Date()})).rejects.toThrow(/motivo|justific/i); await service.correctSubmission({submissionId:21,actorUserId:9,answers:{notes:"Depois"},reason:"Correção conferida",now:new Date()}); expect(p.repository.appendRevision).toHaveBeenCalledWith(expect.objectContaining({revision:2,reason:"Correção conferida",submissionStatus:"corrected"})); expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({eventType:"submission.corrected"})); });
  it("desativa formulário com status disabled sem apagar histórico", async () => { const p=ports(); p.repository.getTemplate=vi.fn(async id=>({id,tenantId:7,status:"active" as const})); const result=await createFormService(7,p).disableForm({formId:3,actorUserId:9,now:new Date()}); expect(p.repository.disableForm).toHaveBeenCalledWith(expect.objectContaining({formId:3})); expect(result.status).toBe("disabled"); expect(p.audit.append).toHaveBeenCalledWith(expect.objectContaining({after:{status:"disabled"}})); expect(p.events.append).toHaveBeenCalledWith(expect.objectContaining({eventType:"form.disabled"})); });
  it("cria binding somente para versão publicada do mesmo formulário e tenant", async () => { const p=ports(); p.repository.getVersion=vi.fn(async id=>({id,tenantId:7,formId:3,version:2,status:"published" as const,definition:publishedDefinition})); const result=await createFormService(7,p).bindForm({formId:3,formVersionId:5,contextType:"incident",contextId:"88",actorUserId:9,now:new Date()}); expect(p.repository.bindForm).toHaveBeenCalledWith(expect.objectContaining({formId:3,formVersionId:5,contextType:"incident",contextId:"88"})); expect(result.incidentTransitionRequested).toBe(false); });
  it("rejeita binding quando a versão não é publicada", async () => { const p=ports(); await expect(createFormService(7,p).bindForm({formId:3,formVersionId:5,contextType:"incident",contextId:"88",actorUserId:9,now:new Date()})).rejects.toThrow(/publicada/i); expect(p.repository.bindForm).not.toHaveBeenCalled(); });
  it("rejeita binding quando versão pertence a outro formulário ou tenant", async () => { const p=ports(); p.repository.getVersion=vi.fn(async id=>({id,tenantId:8,formId:4,version:2,status:"published" as const,definition:publishedDefinition})); await expect(createFormService(7,p).bindForm({formId:3,formVersionId:5,contextType:"incident",contextId:"88",actorUserId:9,now:new Date()})).rejects.toThrow(/formulário|tenant/i); expect(p.repository.bindForm).not.toHaveBeenCalled(); });
});
