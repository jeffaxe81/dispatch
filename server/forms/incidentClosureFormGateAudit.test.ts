import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {assertClosureFormReadiness,IncidentClosureBlockedError,recordIncidentClosureBlocked} from "./incidentClosureFormGate";

const required={schemaVersion:1 as const,title:"Fechamento",fields:[{id:"x",key:"x",label:"Relatório",type:"short_text" as const,required:false,requiredOnStatuses:["concluida" as const]}]};
const form={formId:7,formVersionId:9};

function blockOf(run:()=>void):IncidentClosureBlockedError {
  try {run();} catch(error) {
    expect(error).toBeInstanceOf(IncidentClosureBlockedError);
    return error as IncidentClosureBlockedError;
  }
  throw new Error("O encerramento deveria ter sido bloqueado.");
}

describe("AXED-F030 — auditoria de tentativa de encerramento bloqueada",()=>{
  it("classifica cada motivo e identifica o formulário",()=>{
    expect(blockOf(()=>assertClosureFormReadiness(required,null,null,form))).toMatchObject({reason:"form_not_submitted",form});
    expect(blockOf(()=>assertClosureFormReadiness(required,{status:"submitted",answers:{x:"Ok"}},"returned",form))).toMatchObject({reason:"form_returned",form});
    expect(blockOf(()=>assertClosureFormReadiness(required,{status:"submitted",answers:{}},null,form))).toMatchObject({reason:"answers_incomplete",form});
  });

  it("grava somente motivo e identificadores, sem respostas",async()=>{
    const values=vi.fn().mockResolvedValue(undefined);
    const error=blockOf(()=>assertClosureFormReadiness(required,{status:"submitted",answers:{x:"Resposta sigilosa"}},"returned",form));
    await recordIncidentClosureBlocked({insert:()=>({values})},{incidentId:11,actorUserId:3,error});
    expect(values).toHaveBeenCalledTimes(1);
    const row=values.mock.calls[0]![0];
    expect(row).toMatchObject({resourceType:"incident",resourceId:11,action:"closure_blocked_by_form",actorUserId:3,beforeData:null});
    expect(row.afterData).toEqual({reason:"form_returned",formId:7,formVersionId:9});
    expect(JSON.stringify(row)).not.toContain("sigilosa");
  });

  it("não propaga falha do registro de auditoria",async()=>{
    const error=new IncidentClosureBlockedError("tenant_unresolved","bloqueado");
    const values=vi.fn().mockRejectedValue(new Error("auditoria indisponível"));
    await expect(recordIncidentClosureBlocked({insert:()=>({values})},{incidentId:11,actorUserId:3,error})).resolves.toBeUndefined();
    expect(values.mock.calls.length).toBe(1);
  });

  it("registra fora da transação e relança o erro original",()=>{
    const db=readFileSync(resolve(import.meta.dirname,"../dbLegacy.ts"),"utf8");
    const transition=db.slice(db.indexOf("export async function transitionIncident("),db.indexOf("export async function assignTeamToIncident("));
    const closed=transition.indexOf("}).catch(async (error: unknown)");
    expect(closed).toBeGreaterThan(transition.indexOf("return after;"));
    expect(transition.indexOf("recordIncidentClosureBlocked(db,")).toBeGreaterThan(closed);
    expect(transition.indexOf("throw error;")).toBeGreaterThan(transition.indexOf("recordIncidentClosureBlocked(db,"));
  });
});
