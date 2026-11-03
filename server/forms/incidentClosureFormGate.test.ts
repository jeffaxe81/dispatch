import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {assertClosureFormReadiness,requiresClosureForm} from "./incidentClosureFormGate";

const optional={schemaVersion:1 as const,title:"Opcional",fields:[{id:"x",key:"x",label:"Nota",type:"short_text" as const,required:false}]};
const required={schemaVersion:1 as const,title:"Fechamento",fields:[{id:"x",key:"x",label:"Relatório de fechamento",type:"short_text" as const,required:false,requiredOnStatuses:["concluida" as const]}]};
describe("AXED-F030 — gate transacional explícito para encerramento",()=>{
  it("não bloqueia formulários sem exigência na fase concluída",()=>{
    expect(requiresClosureForm(optional)).toBe(false);
    expect(()=>assertClosureFormReadiness(optional,null)).not.toThrow();
  });
  it("exige submissão enviada ou corrigida e resposta válida na fase de encerramento",()=>{
    expect(requiresClosureForm(required)).toBe(true);
    expect(()=>assertClosureFormReadiness(required,null)).toThrow(/bloqueado/);
    expect(()=>assertClosureFormReadiness(required,{status:"in_progress",answers:{x:"Ok"}})).toThrow(/não enviado/);
    expect(()=>assertClosureFormReadiness(required,{status:"submitted",answers:{}})).toThrow(/incompletas/);
    expect(()=>assertClosureFormReadiness(required,{status:"corrected",answers:{x:"Relatório completo"}})).not.toThrow();
  });
  it("impede usar revisão devolvida, mas não exige aprovação se a política só requer preenchimento",()=>{
    const submitted={status:"submitted",answers:{x:"Relatório completo"}};
    expect(()=>assertClosureFormReadiness(required,submitted,"returned")).toThrow(/devolvido/);
    expect(()=>assertClosureFormReadiness(required,submitted,"approved")).not.toThrow();
    expect(()=>assertClosureFormReadiness(required,submitted,null)).not.toThrow();
  });
  it("nega definição inválida em vez de ignorar exigência desconhecida",()=>{
    expect(()=>requiresClosureForm({schemaVersion:2,fields:[]})).toThrow(/inválida/);
  });
  it("é executado sob lock antes do UPDATE e de qualquer auditoria no mesmo commit",()=>{
    const db=readFileSync(resolve(import.meta.dirname,"../dbLegacy.ts"),"utf8");
    const transition=db.slice(db.indexOf("export async function transitionIncident("),db.indexOf("export async function assignTeamToIncident("));
    expect(transition.indexOf('.for("update")')).toBeGreaterThan(-1);
    expect(transition.indexOf("assertRequiredIncidentClosureForms(")).toBeGreaterThan(transition.indexOf("assertCurrentIncidentTransition("));
    expect(transition.indexOf("assertRequiredIncidentClosureForms(")).toBeLessThan(transition.indexOf("tx.update(incidents)"));
    const source=readFileSync(resolve(import.meta.dirname,"incidentClosureFormGate.ts"),"utf8");
    expect(source).toContain("eq(formBindings.tenantId,tenantId)");
    expect(source).toContain("eq(formSubmissions.tenantId,tenantId)");
    expect(source).toContain(').for("update")');
    expect(source).toContain('eq(formSubmissionReviews.revision,revision)');
  });
});
