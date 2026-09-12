import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : "";

const routers = read("server/routers.ts");
const tenantOperational = read("server/tenantOperational.ts");
const tenantSchema = read("drizzle/tenantScopeSchema.ts");
const tenantMigration = read("drizzle/0008_multi_tenant_operational_scope.sql");
const clientMain = read("client/src/main.tsx");
const dashboardLayout = read("client/src/components/DashboardLayout.tsx");

describe("fronteira multi-tenant do núcleo operacional", () => {
  it("possui camada explícita de escopo para ocorrências e viaturas", () => {
    expect(tenantSchema).toContain("incidentTenantScopes");
    expect(tenantSchema).toContain("vehicleTenantScopes");
    expect(tenantOperational).toContain("listIncidentsForTenant");
    expect(tenantOperational).toContain("getIncidentForTenant");
    expect(tenantOperational).toContain("listVehiclesForTenant");
    expect(tenantOperational).toContain("assertVehicleTenant");
  });

  it("não deixa as rotas operacionais voltarem a consultas globais", () => {
    expect(routers).toContain("requireActiveTenant");
    expect(routers).toContain("getDashboardDataForTenant");
    expect(routers).toContain("listIncidentsForTenant");
    expect(routers).toContain("listTeamsForTenant");
    expect(routers).toContain("listVehiclesForTenant");
    expect(routers).not.toContain("return listVehicles();");
    expect(routers).not.toContain("return listTeams(ctx.user.operationalRole === \"agente\" ? ctx.user.teamId ?? -1 : undefined);");
  });

  it("faz backfill apenas quando a organização pode ser determinada", () => {
    expect(tenantMigration).toContain("incident_tenant_scopes");
    expect(tenantMigration).toContain("vehicle_tenant_scopes");
    expect(tenantMigration).toMatch(/JOIN\s+teams/i);
    expect(tenantMigration).toMatch(/organizationId\s+IS\s+NOT\s+NULL/i);
    expect(tenantMigration).not.toMatch(/COALESCE\s*\([^)]*organizationId[^)]*,\s*1\s*\)/i);
  });

  it("envia a empresa ativa em todas as chamadas e oferece seleção no portal", () => {
    expect(clientMain).toContain("x-organization-id");
    expect(clientMain).toContain("dispatch.activeOrganizationId");
    expect(dashboardLayout).toContain("dispatch.activeOrganizationId");
    expect(dashboardLayout).toMatch(/Empresa ativa|Organização ativa|Tenant ativo/i);
  });
});
