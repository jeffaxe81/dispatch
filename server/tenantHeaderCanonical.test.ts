import {describe,expect,it} from "vitest";
import {parseTenantHeader} from "./tenantOperational";

describe("R014 — cabeçalho tenant não aceita aliases, duplicidade ou overflow",()=>{
  it("sem cabeçalho permite a política de seleção do servidor",()=>{
    expect(parseTenantHeader({headers:{}})).toBeNull();
  });
  it.each(["1","2","99",String(Number.MAX_SAFE_INTEGER)])(
    "aceita identificador canônico %s",value=>{
      expect(parseTenantHeader({headers:{"x-organization-id":value}})).toBe(Number(value));
    },
  );
  it.each([
    "0","-1","+2","01","0002"," 2","2 ","2.0","2e0","0x2","Infinity",
    "NaN","1\n2","2,3","",String(Number.MAX_SAFE_INTEGER+1),"9999999999999999999"
  ])("rejeita valor ambíguo %s",raw=>{
    if(raw==="")expect(parseTenantHeader({headers:{"x-organization-id":raw}})).toBeNull();
    else expect(()=>parseTenantHeader({headers:{"x-organization-id":raw}})).toThrow();
  });
  it("rejeita cabeçalhos duplicados mesmo com o mesmo identificador",()=>{
    expect(()=>parseTenantHeader({headers:{"x-organization-id":["2","2"]}})).toThrow(/duplicado/);
    expect(()=>parseTenantHeader({headers:{"x-organization-id":["2","3"]}})).toThrow(/duplicado/);
  });
});
