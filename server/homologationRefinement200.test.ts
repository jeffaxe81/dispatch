import { describe, expect, it } from "vitest";
import {
  HOMOLOGATION_PROFILES, HOMOLOGATION_ROUTE_PERMISSIONS,
  isHomologationRouteAllowed, validateHomologationRoleAssignment,
  mustUseDynamicAuthorization,
} from "../shared/homologationProfiles";

// A reproducible decision matrix: 5 roles x 20 boundary cases = 100
// independent Vitest cases, with no credentials, network or database I/O.
const now = new Date("2026-11-07T12:00:00.000Z");
const msDay = 24 * 60 * 60 * 1000;
const expiration = (ms: number) => new Date(now.getTime() + ms);
const base = {
  stage: "homologation" as unknown, enabled: "true" as unknown,
  userIsBaseAdmin: false, organizationId: 10 as number | null | undefined,
  teamId: 7 as number | null | undefined,
  expiresAt: expiration(2 * msDay) as Date | null | undefined,
};
const cases: ReadonlyArray<{
  id: string; label: string; patch: Partial<typeof base>; expected: boolean | "team-dependent";
}> = [
  { id:"01",label:"2 days expiry",patch:{},expected:true },
  { id:"02",label:"14 days exact expiry",patch:{expiresAt:expiration(14*msDay)},expected:true },
  { id:"03",label:"1ms valid expiry",patch:{expiresAt:expiration(1)},expected:true },
  { id:"04",label:"expiry equals now",patch:{expiresAt:expiration(0)},expected:false },
  { id:"05",label:"expiry -1ms",patch:{expiresAt:expiration(-1)},expected:false },
  { id:"06",label:"expiry exceeds 14d by 1ms",patch:{expiresAt:expiration(14*msDay+1)},expected:false },
  { id:"07",label:"invalid date",patch:{expiresAt:new Date("invalid")},expected:false },
  { id:"08",label:"undefined expiry",patch:{expiresAt:undefined},expected:false },
  { id:"09",label:"null expiry",patch:{expiresAt:null},expected:false },
  { id:"10",label:"undefined org",patch:{organizationId:undefined},expected:false },
  { id:"11",label:"zero org",patch:{organizationId:0},expected:false },
  { id:"12",label:"negative org",patch:{organizationId:-3},expected:false },
  { id:"13",label:"fractional org",patch:{organizationId:1.5},expected:false },
  { id:"14",label:"NaN org",patch:{organizationId:Number.NaN},expected:false },
  { id:"15",label:"production stage",patch:{stage:"production"},expected:false },
  { id:"16",label:"invalid stage capitalization",patch:{stage:"Homologation"},expected:false },
  { id:"17",label:"feature flag disabled",patch:{enabled:"false"},expected:false },
  { id:"18",label:"boolean feature flag",patch:{enabled:true},expected:false },
  { id:"19",label:"base administrator",patch:{userIsBaseAdmin:true},expected:false },
  { id:"20",label:"team omitted",patch:{teamId:undefined},expected:"team-dependent" },
];
if (cases.length !== 20 || HOMOLOGATION_PROFILES.length !== 5) {
  throw new Error("QA regression matrix must remain exactly 100 assignment cases.");
}

describe("100 real QA assignment policy test cases (5 roles x 20 variants)", () => {
  for (const role of HOMOLOGATION_PROFILES) {
    for (const item of cases) {
      it(`QA-ASSIGN-${role.code}-${item.id}: ${item.label}`, () => {
        const expected = item.expected === "team-dependent"
          ? role.defaultScope !== "equipe" : item.expected;
        const actual = validateHomologationRoleAssignment({
          ...base, ...item.patch, code:role.code,
        },now);
        expect(actual).toBe(expected);
      });
    }
  }
});

// Five profiles x 20 exact route permissions = another 100 executable
// contract cases. An arbitrary route or extra database permission cannot
// bypass the QA route allowlist.
const routeCases = [
  ...Object.keys(HOMOLOGATION_ROUTE_PERMISSIONS),
  "access.createRole", "access.assignRole", "integrations.connections.create",
] as const;
if (routeCases.length !== 20) {
  throw new Error("QA route matrix must remain 20 routes per role.");
}
describe("100 QA tRPC route authorizations (5 roles x 20 routes)", () => {
  for (const role of HOMOLOGATION_PROFILES) {
    for (const route of routeCases) {
      it(`QA-ROUTE-${role.code}-${route}`, () => {
        const permission = Object.prototype.hasOwnProperty.call(HOMOLOGATION_ROUTE_PERMISSIONS, route)
          ? HOMOLOGATION_ROUTE_PERMISSIONS[route as keyof typeof HOMOLOGATION_ROUTE_PERMISSIONS] : undefined;
        const expected = permission === null ||
          (permission !== undefined && role.permissionCodes.some(p => p === permission));
        expect(isHomologationRouteAllowed(role.code, route, role.permissionCodes)).toBe(expected);
        // Missing permission cannot be supplied by the underlying legacy role.
        if (typeof permission === "string") {
          expect(isHomologationRouteAllowed(role.code, route, [])).toBe(false);
        }
      });
    }
  }
});
describe("QA regression: suppressed legacy fallback after role expiry/revocation", () => {
  for (const validCount of [0,1,2]) {
    for (const priorQa of [false,true]) {
      it(`legacy fallback with ${validCount} valid roles, QA history=${priorQa}`,()=>{
        expect(mustUseDynamicAuthorization(validCount,priorQa)).toBe(validCount>0 || priorQa);
      });
    }
  }
  it("does not turn an unknown role into an unrestricted QA role",()=>{
    for(const route of routeCases){
      expect(isHomologationRouteAllowed("homolog_super_admin",route,["*","roles.create"])).toBe(false);
    }
  });
});
