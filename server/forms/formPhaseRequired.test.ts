import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formSchemaDefinitionSchema, validateFormAnswers } from "../../shared/forms";

const definition = {
  schemaVersion: 1,
  title: "Vistoria de campo",
  fields: [
    { id: "a", key: "observacao", label: "Observação", type: "short_text", required: false,
      requiredOnStatuses: ["em_atendimento", "concluida"] },
    { id: "b", key: "categoria", label: "Categoria", type: "short_text", required: true },
  ],
};

describe("AXED-F022 — exigência de campos por fase autorizada", () => {
  it("exige observação quando ocorrência está em atendimento", () => {
    const result=validateFormAnswers(definition,{categoria:"Emergência"},{incidentStatus:"em_atendimento"});
    expect(result.success).toBe(false);
    if(!result.success)expect(result.issues.some(x=>x.message.includes("fase em_atendimento"))).toBe(true);
  });
  it("exige observação no encerramento, sem bloquear fase não configurada", () => {
    expect(validateFormAnswers(definition,{categoria:"Emergência"},{incidentStatus:"concluida"}).success).toBe(false);
    expect(validateFormAnswers(definition,{categoria:"Emergência"},{incidentStatus:"triagem"}).success).toBe(true);
  });
  it("não permite tratar fase desconhecida como autorização para campo ausente", () => {
    const result=validateFormAnswers(definition,{categoria:"Emergência"});
    expect(result.success).toBe(false);
    if(!result.success) expect(result.issues.some(x=>x.message.includes("confirmação da fase"))).toBe(true);
  });
  it("preserva os campos sempre obrigatórios de esquemas legados", () => {
    expect(validateFormAnswers(definition,{observacao:"Preenchida"},{incidentStatus:"triagem"}).success).toBe(false);
    expect(validateFormAnswers(definition,{categoria:"Emergência",observacao:"Preenchida"},{incidentStatus:"concluida"}).success).toBe(true);
  });
  it("rejeita códigos de fase inventados em formulário publicado", () => {
    const invalid={...definition,fields:[{...definition.fields[0],requiredOnStatuses:["fase_inexistente"]}]};
    expect(formSchemaDefinitionSchema.safeParse(invalid).success).toBe(false);
  });
  it("versões existentes sem fases continuam válidas, sem nova migration", () => {
    const legacy={schemaVersion:1,title:"Legado",fields:[{id:"a",key:"nota",label:"Nota",type:"short_text",required:false}]};
    expect(validateFormAnswers(legacy,{}).success).toBe(true);
  });
  it("a fase é derivada da ocorrência autorizada; cliente não define o status", () => {
    const formsRouter=fs.readFileSync(path.resolve(import.meta.dirname,"formsRouter.ts"),"utf8");
    const runtime=fs.readFileSync(path.resolve(import.meta.dirname,"formsRuntimeContext.ts"),"utf8");
    const service=fs.readFileSync(path.resolve(import.meta.dirname,"formService.ts"),"utf8");
    expect(formsRouter).toContain("resolveIncidentStatus(input.contextId)");
    expect(formsRouter).toContain("resolveSubmissionIncidentStatus(submissionId)");
    expect(formsRouter).toContain("incidentStatus:_untrustedStatus");
    expect(runtime).toContain("getIncidentForTenant(tenantId, Number(incidentId))");
    expect(runtime).toContain("assertCanReadIncident(user, row.incident)");
    expect(service).toContain("validateFormAnswers(definition,answers,{incidentStatus:input.incidentStatus})");
  });
});
