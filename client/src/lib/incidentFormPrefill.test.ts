import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { proposeAuthorizedIncidentFormPrefill } from "./incidentFormPrefill";
import type { FormSchemaDefinition } from "@shared/forms";

const schema: FormSchemaDefinition = {
  schemaVersion: 1, title: "Vistoria",
  fields: [
    { type: "short_text", key: "incidentCode", id: "code", label: "Código", required: false },
    { type: "single_choice", key: "incidentCategory", id: "category", label: "Categoria", options: [{value:"Alagamento",label:"Alagamento"}], required: false },
    { type: "single_choice", key: "incidentPriority", id: "priority", label: "Prioridade", options: [{value:"alta",label:"Alta"}], required: false },
    { type: "long_text", key: "requesterName", id: "requester", label: "Solicitante", required: false },
  ],
};
const incident = { code: "INC-88", category: "Alagamento", priority: "alta" };

describe("AXED-F028: pré-preenchimento com fonte de ocorrência autorizada", () => {
  it("somente preenche três campos explicitamente permitidos e compatíveis", () => {
    expect(proposeAuthorizedIncidentFormPrefill(schema, {}, incident)).toEqual({
      incidentCode: "INC-88", incidentCategory: "Alagamento", incidentPriority: "alta",
    });
  });
  it("nunca sobrescreve valores já fornecidos e não altera objeto original", () => {
    const prior = { incidentCode: "Manual", requesterName: "Pessoa", incidentPriority: null };
    expect(proposeAuthorizedIncidentFormPrefill(schema, prior, incident)).toEqual({
      ...prior, incidentPriority: "alta", incidentCategory: "Alagamento",
    });
    expect(prior.incidentPriority).toBeNull();
  });
  it("não aceita fonte ausente, mesmo quando formulário tem campos conhecidos", () => {
    expect(proposeAuthorizedIncidentFormPrefill(schema, { incidentCode: "Livre" }, null)).toEqual({incidentCode: "Livre"});
  });
  it("ignora campos externos/PII e tipos incompatíveis", () => {
    const maliciousSchema: FormSchemaDefinition = {schemaVersion:1,title:"T",fields:[
      {id:"a",key:"incidentCode",label:"Número",type:"number",required:false},
      {id:"b",key:"requesterContact",label:"Contato",type:"short_text",required:false},
      {id:"c",key:"address",label:"Endereço",type:"short_text",required:false},
      {id:"d",key:"description",label:"Texto",type:"long_text",required:false},
      {id:"e",key:"incidentCategory",label:"Categoria",type:"single_choice",options:[{value:"Outro",label:"Outro"}],required:false},
    ]};
    expect(proposeAuthorizedIncidentFormPrefill(maliciousSchema, {}, incident)).toEqual({});
  });
  it("respeita limites mínimos/máximos de texto", () => {
    const strict: FormSchemaDefinition={schemaVersion:1,title:"T",fields:[
      {id:"s",key:"incidentCode",label:"Código",type:"short_text",required:false,minLength:20},
    ]};
    expect(proposeAuthorizedIncidentFormPrefill(strict, {}, incident)).toEqual({});
  });
  it("a interface exige ação humana, RBAC de preenchimento e leitura autorizada", () => {
    const root=path.resolve(import.meta.dirname,"../components/forms");
    const workspace=fs.readFileSync(path.join(root,"IncidentFormWorkspace.tsx"),"utf8");
    const dock=fs.readFileSync(path.join(root,"IncidentFormsOperationalDock.tsx"),"utf8");
    expect(workspace).toContain("Preencher campos autorizados da ocorrência");
    expect(workspace).toContain("proposeAuthorizedIncidentFormPrefill(");
    expect(workspace).toContain('state === "in_progress"');
    expect(dock).toContain("trpc.incidents.get.useQuery");
    expect(dock).toContain("open && validIncident && canFill");
    expect(dock).not.toContain("requesterContact: incidentForPrefill");
  });
});
