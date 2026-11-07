import {beforeEach,describe,expect,it,vi} from "vitest";
import superjson from "superjson";
import {fetchRequestHandler} from "@trpc/server/adapters/fetch";
import {rootRouter} from "./rootRouter";
import {getDb} from "./db";
import {getAccessSnapshot} from "./accessControl";
import {requireActiveTenant} from "./tenantOperational";
import type {TrpcContext} from "./_core/context";

vi.mock("./db",async importOriginal=>{
  const real=await importOriginal<typeof import("./db")>();
  return {...real,getDb:vi.fn()};
});
vi.mock("./accessControl",async importOriginal=>{
  const real=await importOriginal<typeof import("./accessControl")>();
  return {...real,getAccessSnapshot:vi.fn()};
});

/**
 * In-process HTTP adapter test of the REAL composed tRPC rootRouter and
 * REAL getTenantSelection / requireActiveTenant authorization logic.
 * Only the database interface + access snapshot are faked (two synthetic
 * eligible organizations). This is NOT a deployed-server E2E test.
 */
const orgs=[
  {id:2,code:"TEST-A",name:"Organização A (fictícia)"},
  {id:3,code:"TEST-B",name:"Organização B (fictícia)"}
];
const agent={
  id:71,openId:"fixture-field-71",role:"user",operationalRole:"agente",
  teamId:null,active:true,name:"Agente fictício"
};
const base="http://127.0.0.1/api/trpc";

function makeDb(){
  return {
    select:()=>({
      from:()=>({
        where:()=>({
          orderBy:async()=>orgs,
          limit:async()=>[]
        })
      })
    })
  };
}
type HttpCase={user:typeof agent|null,header?:string,procedure?:string};
async function call({user,header,procedure="tenant.selection"}:HttpCase){
  const headers:Record<string,string>={accept:"application/json"};
  if(header!==undefined)headers["x-organization-id"]=header;
  const url=new URL(base+"/"+procedure);
  url.searchParams.set("input",JSON.stringify(superjson.serialize(null)));
  const req=new Request(url,{method:"GET",headers});
  const response=await fetchRequestHandler({
    router:rootRouter,
    endpoint:"/api/trpc",
    req,
    createContext:async()=>({
      user,
      req:{headers},
      res:{}
    } as unknown as TrpcContext)
  });
  const body=await response.json() as {
    result?:{data?:unknown};
    error?:{message?:string,data?:{code?:string},json?:{data?:{code?:string}}}
  };
  return {status:response.status,body,result:body.result?.data===undefined
    ? undefined:superjson.deserialize(body.result.data as ReturnType<typeof superjson.serialize>)};
}

beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(getDb).mockResolvedValue(makeDb() as never);
  vi.mocked(getAccessSnapshot).mockResolvedValue({
    assignments:[
      {organizationId:2,defaultScope:"organizacao",roleCode:"agente",teamId:null,organizationalUnitId:null},
      {organizationId:3,defaultScope:"organizacao",roleCode:"agente",teamId:null,organizationalUnitId:null}
    ],
    permissions:["occurrences.view","occurrences.transition"]
  } as never);
});

describe("AXE Dispatch — Mobile consumer HTTP tenant.selection contract",()=>{
  it("exposes tenant.selection on the actual runtime HTTP rootRouter",async()=>{
    const r=await call({user:agent});
    expect(r.status).toBe(200);
    expect(r.result).toEqual({
      organizations:orgs,activeOrganizationId:null,requiresSelection:true
    });
    expect(getAccessSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each(["2","3"])("respects authorized organization ID %s",async header=>{
    const r=await call({user:agent,header});
    expect(r.status).toBe(200);
    expect(r.result).toMatchObject({
      organizations:orgs,activeOrganizationId:Number(header),requiresSelection:false
    });
  });

  it("never accepts an unauthorized header as active tenant",async()=>{
    const result=await call({user:agent,header:"999"});
    expect(result.status).toBe(200);
    expect(result.result).toMatchObject({
      activeOrganizationId:null,requiresSelection:true
    });
  });

  it.each(["0","-1","abc","1.5","9007199254740993","2,3"," 2 ","2\n"])
    ("rejects malformed organization header before returning data: %s",async header=>{
      const r=await call({user:agent,header});
      expect(r.status).toBe(400);
      expect(r.body.error?.data?.code??r.body.error?.json?.data?.code)
        .toBe("BAD_REQUEST");
    });

  it("requires a valid authenticated session even for tenant selection",async()=>{
    const r=await call({user:null});
    expect(r.status).toBe(401);
    expect(r.body.error).toBeDefined();
    expect(getDb).not.toHaveBeenCalled();
    expect(getAccessSnapshot).not.toHaveBeenCalled();
  });

  it("blocks inactive agent before any organization query",async()=>{
    const r=await call({user:{...agent,active:false}});
    expect(r.status).toBe(403);
    expect(getDb).not.toHaveBeenCalled();
    expect(getAccessSnapshot).not.toHaveBeenCalled();
  });

  it("auto-selects the sole organization in the synthetic access snapshot",async()=>{
    orgs.splice(0,orgs.length,{id:2,code:"TEST-A",name:"Organização A (fictícia)"});
    const r=await call({user:agent});
    expect(r.status).toBe(200);
    expect(r.result).toMatchObject({activeOrganizationId:2,requiresSelection:false});
    orgs.splice(0,orgs.length,
      {id:2,code:"TEST-A",name:"Organização A (fictícia)"},
      {id:3,code:"TEST-B",name:"Organização B (fictícia)"});
  });

  it("returns safe empty selection for a user with no eligible tenants",async()=>{
    const original=orgs.splice(0,orgs.length);
    const r=await call({user:agent});
    expect(r.status).toBe(200);
    expect(r.result).toEqual({
      organizations:[],activeOrganizationId:null,requiresSelection:false
    });
    orgs.push(...original);
  });

  it("refuses unselected, malformed and forged tenants at the actual server scope gate",async()=>{
    await expect(requireActiveTenant(agent as never,{headers:{}}))
      .rejects.toMatchObject({code:"BAD_REQUEST"});
    await expect(requireActiveTenant(agent as never,{headers:{"x-organization-id":"999"}}))
      .rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(requireActiveTenant(agent as never,{headers:{"x-organization-id":"INVALID"}}))
      .rejects.toMatchObject({code:"BAD_REQUEST"});
    await expect(requireActiveTenant(agent as never,{headers:{"x-organization-id":"3"}}))
      .resolves.toBe(3);
  });

  it("uses SuperJSON envelope expected by the Mobile tRPC client",async()=>{
    const r=await call({user:agent,header:"2"});
    expect(r.body.result?.data).toBeDefined();
    const decoded=superjson.deserialize(r.body.result!.data as ReturnType<typeof superjson.serialize>) as Record<string,unknown>;
    expect(decoded.activeOrganizationId).toBe(2);
    expect(decoded.organizations).toEqual(orgs);
  });
});
