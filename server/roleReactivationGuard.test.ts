import {describe, expect, it} from "vitest";
import {assertRoleReactivationAllowed,type RoleReactivationInput} from "./roleReactivationGuard";
const now = new Date("2026-11-07T12:00:00.000Z");
const base: RoleReactivationInput = {
  activate:true,roleCode:"homolog_agente_campo",roleActive:true,
  defaultScope:"equipe",organizationId:10,organizationalUnitId:null,teamId:7,
  teamOrganizationId:10,expiresAt:new Date(now.getTime()+86_400_000),
  userIsBaseAdmin:false,stage:"homologation",qaEnabled:"true",
};
describe("R009 — reativação QA revalida a concessão original antes de mudar sessões",()=>{
  it("aceita somente reativação QA válida em laboratório isolado",()=>{
    expect(()=>assertRoleReactivationAllowed(base,now)).not.toThrow();
    expect(()=>assertRoleReactivationAllowed({...base,activate:false,roleActive:false,expiresAt:new Date(0)},now)).not.toThrow();
  });
  it.each([
    ["QA expirado",{expiresAt:now}],
    ["QA > 14 dias",{expiresAt:new Date(now.getTime()+14*86_400_000+1)}],
    ["QA sem prazo",{expiresAt:null}],
    ["QA ambiente produtivo",{stage:"production"}],
    ["QA flag desligada",{qaEnabled:"false"}],
    ["QA administrador base",{userIsBaseAdmin:true}],
    ["QA papel inativo",{roleActive:false}],
    ["QA equipe não autorizada",{teamOrganizationId:11}],
    ["QA equipe inexistente",{teamOrganizationId:null}],
    ["QA equipe não informada",{teamId:null}],
    ["QA sem organização",{organizationId:null}],
    ["QA unidade inesperada",{organizationalUnitId:99}],
    ["QA papel inexistente",{roleCode:"homolog_custom_role"}],
  ] as const)("nega %s",(_label,change)=>{
    expect(()=>assertRoleReactivationAllowed({...base,...change},now)).toThrow();
  });
  it("preserva perfil QA observador válido por organização, sem equipe",()=>{
    expect(()=>assertRoleReactivationAllowed({...base,roleCode:"homolog_observador",defaultScope:"organizacao",teamId:null,teamOrganizationId:null},now)).not.toThrow();
  });
  it("nega atribuição global com organização embutida mesmo para papel normal",()=>{
    expect(()=>assertRoleReactivationAllowed({...base,roleCode:"administrador",defaultScope:"global",organizationId:10,teamId:null,teamOrganizationId:null},now)).toThrow();
  });
  it("permite papel normal de organização válido sem prazo",()=>{
    expect(()=>assertRoleReactivationAllowed({...base,roleCode:"supervisor",defaultScope:"organizacao",teamId:null,teamOrganizationId:null,expiresAt:null,stage:"production"},now)).not.toThrow();
  });
  it("nega qualquer papel não-QA vencido ou inativo, mas deixa desativar",()=>{
    for(const patch of [{expiresAt:now},{roleActive:false}]){
      const ordinary={...base,roleCode:"supervisor",defaultScope:"organizacao" as const,teamId:null,teamOrganizationId:null,...patch};
      expect(()=>assertRoleReactivationAllowed(ordinary,now)).toThrow();
      expect(()=>assertRoleReactivationAllowed({...ordinary,activate:false},now)).not.toThrow();
    }
  });
});
