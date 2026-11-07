import { describe, expect, it } from "vitest";
import {
  HOMOLOGATION_PROFILES, homologationRuntimeEnabled, isHomologationProfileCode,
  isReservedHomologationCode, validateHomologationRoleAssignment, filterRolePermissionCodes,
} from "../shared/homologationProfiles";

const now = new Date("2026-11-07T12:00:00.000Z");
const expiresAt = new Date("2026-11-09T12:00:00.000Z");
const scoped = { code:"homolog_executor",stage:"homologation",enabled:"true",
  userIsBaseAdmin:false,organizationId:10,expiresAt };

describe("Perfis P0 de homologação — concessão mínima e validade limitada",()=>{
  it("defines exactly five templates without privileged or integration permissions",()=>{
    expect(HOMOLOGATION_PROFILES.map(x=>x.code)).toEqual([
      "homolog_observador","homolog_executor","homolog_agente_campo",
      "homolog_auditor","homolog_revisor"
    ]);
    for (const item of HOMOLOGATION_PROFILES) {
      expect(item.code).toMatch(/^homolog_[a-z_]+$/);
      expect(item.defaultScope).not.toBe("global");
      expect(item.permissionCodes).not.toContain("*");
      expect(item.permissionCodes.every(p => !/^(roles|users|integrations|system)\./.test(p))).toBe(true);
      expect(item.permissionCodes).not.toContain("reports.export");
    }
    expect(HOMOLOGATION_PROFILES.find(x=>x.code==="homolog_auditor")?.permissionCodes).not.toContain("occurrences.create");
    expect(HOMOLOGATION_PROFILES.find(x=>x.code==="homolog_revisor")?.permissionCodes).not.toContain("occurrences.transition");
  });
  it("never turns a production-like/default runtime into a QA sandbox",()=>{
    for (const [stage,flag] of [[undefined,undefined],["production","true"],["homologation","false"],["development","true"],["Homologation","true"],["homologation",true]]) {
      expect(homologationRuntimeEnabled(stage,flag)).toBe(false);
      expect(validateHomologationRoleAssignment({...scoped,stage,enabled:flag},now)).toBe(false);
    }
    expect(homologationRuntimeEnabled("homologation","true")).toBe(true);
  });
  it("rejects unknown reserved codes and administrative identities",()=>{
    expect(isReservedHomologationCode("homolog_super_administrador")).toBe(true);
    expect(isHomologationProfileCode("homolog_super_administrador")).toBe(false);
    expect(validateHomologationRoleAssignment({...scoped,code:"homolog_super_administrador"},now)).toBe(false);
    expect(validateHomologationRoleAssignment({...scoped,userIsBaseAdmin:true},now)).toBe(false);
  });
  it("requires a verified organization and a short bounded expiry",()=>{
    expect(validateHomologationRoleAssignment(scoped,now)).toBe(true);
    for (const invalid of [null,undefined,0,-1,1.1,Number.MAX_SAFE_INTEGER+1]) {
      expect(validateHomologationRoleAssignment({...scoped,organizationId:invalid},now)).toBe(false);
    }
    for (const expiry of [null,undefined,new Date("2026-11-06"),new Date("2026-12-05"),new Date("invalid")]) {
      expect(validateHomologationRoleAssignment({...scoped,expiresAt:expiry},now)).toBe(false);
    }
  });
  it("suppresses reserved permissions outside sandbox without reviving legacy fallback",()=>{
    const rows=[
      {code:"occurrences.create",roleCode:"homolog_executor"},
      {code:"reports.view",roleCode:"homolog_auditor"},
      {code:"occurrences.view",roleCode:"supervisor"},
    ];
    expect(filterRolePermissionCodes(rows,"production","false")).toEqual(["occurrences.view"]);
    expect(filterRolePermissionCodes(rows,"homologation","true")).toEqual([
      "occurrences.create","reports.view","occurrences.view"
    ]);
  });
  it("requires explicit team for a field QA agent",()=>{
    const base={...scoped,code:"homolog_agente_campo"};
    expect(validateHomologationRoleAssignment(base,now)).toBe(false);
    expect(validateHomologationRoleAssignment({...base,teamId:9},now)).toBe(true);
    expect(validateHomologationRoleAssignment({...base,teamId:0},now)).toBe(false);
  });
});
