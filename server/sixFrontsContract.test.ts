import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const source=(path:string)=>readFileSync(path,"utf8");

describe("AXE Dispatch — six-front incremental integration regression",()=>{
  it("uses literal LIKE in both tenant-aware and legacy search, while retaining SQL scope",()=>{
    const tenant=source("server/tenantOperational.ts");
    const legacy=source("server/dbLegacy.ts");
    const tenantStart=tenant.indexOf("export async function listIncidentsForTenant(");
    const tenantEnd=tenant.indexOf("export async function getIncidentForTenant(",tenantStart);
    const segment=tenant.slice(tenantStart,tenantEnd);
    expect(segment).toContain("incidentLiteralSearchPattern(input.search)");
    expect(segment).toContain("ESCAPE '!'");
    expect(segment).toContain("eq(incidentTenantScopes.organizationId, tenantId)");
    expect(segment).toContain(".limit(input.pageSize)");
    expect(segment).toContain("count()");
    const legacySegment=legacy.slice(legacy.indexOf("export async function listIncidents("),
      legacy.indexOf("export async function getIncidentById("));
    expect(legacySegment).toContain("incidentLiteralSearchPattern(input.search)");
    expect(legacySegment).toContain("ESCAPE '!'");
  });

  it("checks server GPS freshness before database location write",()=>{
    const router=source("server/tenantAwareAppRouter.ts");
    const loc=router.slice(router.indexOf("    recordLocation: operationalProcedure"),
      router.indexOf("  vehicles: router("));
    const auth=loc.indexOf("assertOwnTeam(ctx.user, input.teamId)");
    const sample=loc.indexOf("assertRecentTeamLocation(input.capturedAt)");
    const write=loc.indexOf("recordTeamLocation({ ...input, userId: ctx.user.id })");
    expect(auth).toBeGreaterThan(0);
    expect(sample).toBeGreaterThan(auth);
    expect(write).toBeGreaterThan(sample);
  });
});
