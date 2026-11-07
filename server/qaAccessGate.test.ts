import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertHomologationRouteAccess } from "./qaAccessGate";
import { getAccessSnapshot } from "./accessControl";

vi.mock("./accessControl",()=>({ getAccessSnapshot:vi.fn() }));
const snapshot = vi.mocked(getAccessSnapshot);
const assignment=(roleCode:string, scope:"organizacao"|"equipe"="organizacao")=>({
  roleCode, defaultScope:scope, organizationId:11,
  organizationalUnitId:null, teamId:scope==="equipe"?9:null,
});
function give(roleCode:string,permissions:string[],history=true) {
  snapshot.mockResolvedValue({
    assignments:[assignment(roleCode)] as any,
    hasHistoricQaRole:history,
    permissions:new Set(permissions),
  });
}
describe("P0 — QA route fence before legacy operational handlers",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("observer cannot create even if underlying user is an operator",async()=>{
    give("homolog_observador",["occurrences.view","dispatch.view"]);
    await expect(assertHomologationRouteAccess(4,"incidents.create")).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(assertHomologationRouteAccess(4,"incidents.list")).resolves.toBeUndefined();
  });
  it("executor can create synthetic occurrence, but cannot assign role",async()=>{
    give("homolog_executor",["occurrences.create","occurrences.view"]);
    await expect(assertHomologationRouteAccess(4,"incidents.create")).resolves.toBeUndefined();
    await expect(assertHomologationRouteAccess(4,"access.assignRole")).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("missing database permission blocks a nominally allowed route",async()=>{
    give("homolog_executor",[]);
    await expect(assertHomologationRouteAccess(4,"incidents.create")).rejects.toBeInstanceOf(TRPCError);
  });
  it("expired or revoked QA cannot restore legacy fallback",async()=>{
    snapshot.mockResolvedValue({assignments:[],hasHistoricQaRole:true,permissions:new Set()} as any);
    await expect(assertHomologationRouteAccess(4,"incidents.list")).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("no historical QA role: unaffected legacy users pass",async()=>{
    snapshot.mockResolvedValue({assignments:[],hasHistoricQaRole:false,permissions:new Set()} as any);
    await expect(assertHomologationRouteAccess(4,"teams.list")).resolves.toBeUndefined();
  });
  it("valid replacement by ordinary role is not permanently fenced",async()=>{
    snapshot.mockResolvedValue({assignments:[assignment("supervisor")] as any,
      hasHistoricQaRole:true,permissions:new Set(["teams.view"])} as any);
    await expect(assertHomologationRouteAccess(4,"teams.list")).resolves.toBeUndefined();
  });
  it("invalid QA role or wrong scope fails closed",async()=>{
    give("homolog_super_admin",["*","roles.create"]);
    await expect(assertHomologationRouteAccess(4,"access.me")).rejects.toMatchObject({code:"FORBIDDEN"});
    snapshot.mockResolvedValue({assignments:[{...assignment("homolog_agente_campo","equipe"),teamId:null}],
      hasHistoricQaRole:true,permissions:new Set(["occurrences.view"])} as any);
    await expect(assertHomologationRouteAccess(4,"incidents.get")).rejects.toMatchObject({code:"FORBIDDEN"});
  });
});
