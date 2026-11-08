import {describe,expect,it} from "vitest";
import fs from "node:fs";
import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.resolve(import.meta.dirname,p),"utf8");
function section(content:string,start:string,end:string){
 const a=content.indexOf(start);const b=content.indexOf(end,a+start.length);
 if(a<0||b<0)throw new Error("Seção da política não encontrada.");
 return content.slice(a,b);
}
describe("Frentes 04 e 05 — auditoria sem rastros desnecessários de localização/PII",()=>{
  it("grava GPS operacional normalmente, sem coordenadas exatas no audit log",()=>{
    const code=section(read("dbLegacy.ts"),
      "export async function recordTeamLocation(",
      "const evidenceFileTypes =");
    expect(code).toContain("latitude: input.latitude.toFixed(7)");
    expect(code).toContain("longitude: input.longitude.toFixed(7)");
    expect(code).toContain("teamLocationAdvancePredicate(");
    expect(code).toContain("locationStored: true");
    expect(code).toContain("capturedAt: input.capturedAt.toISOString()");
    expect(code).not.toContain("afterData: { latitude:");
    expect(code).not.toContain("afterData: { longitude:");
  });
  it("mantém filtros salvos por usuário sem replicar nome livre no histórico",()=>{
    const code=section(read("dbLegacy.ts"),
      "export async function saveDashboardFilter(",
      "export async function deleteDashboardFilter(");
    expect(code).toContain("name: input.name.trim()");
    expect(code).toContain("filterSaved: true");
    expect(code).toContain("actorUserId: input.userId");
    expect(code).not.toContain("beforeData: before ? { name:");
    expect(code).not.toContain("afterData: { name: values.name");
  });
  it("não reduz a revogação de sessão durante a reativação de perfis",()=>{
    const code=section(read("dbLegacy.ts"),
      "export async function setUserRoleAssignmentActive(",
      "export async function updateUserProfileAccess(");
    expect(code.indexOf("assertRoleReactivationAllowed("))
      .toBeLessThan(code.indexOf("await tx.update(userRoleAssignments).set({ active: input.active"));
    expect(code).toContain("await tx.update(localAuthSessions).set({ revokedAt: new Date() })");
  });
});
