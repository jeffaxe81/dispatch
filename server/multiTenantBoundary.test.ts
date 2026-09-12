import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : "";

const rootRouter = read("server/rootRouter.ts");
const tenantRouter = read("server/tenantAwareAppRouter.ts");
const dispatchRouter = read("server/dispatchRouter.ts");
const formsRuntime = read("server/forms/formsRuntimeContext.ts");
const tenantOperational = read("server/tenantOperational.ts");
const tenantSchema = read("drizzle/tenantScopeSchema.ts");
const tenantMigration = read("drizzle/0008_multi_tenant_operational_scope.sql");
const clientMain = read("client/src/main.tsx");
const tenantShell = read("client/src/components/TenantBoundaryShell.tsx");

describe("fronteira multi-tenant do núcleo operacional", () => {
  it("possui camada explícita de escopo para ocorrências e viaturas", () => {
    expect(tenantSchema).toContain("incidentTenantScopes");
    expect(tenantSchema).toContain("vehicleTenantScopes");
    expect(tenantOperational).toContain("listIncidentsForTenant");
    expect(tenantOperational).toContain("getIncidentForTenant");
    expect(tenantOperational).toContain("listVehiclesForTenant");
    expect(tenantOperational).toContain("assertVehicleTenant");
  });

  it("ativa o router tenant-aware no root e protege os fluxos operacionais", () => {
    expect(rootRouter).toContain("tenantAwareAppRouter");
    expect(tenantRouter).toContain("requireActiveTenant");
    expect(tenantRouter).toContain("getDashboardDataForTenant");
    expect(tenantRouter).toContain("listIncidentsForTenant");
    expect(tenantRouter).toContain("listTeamsForTenant");
    expect(tenantRouter).toContain("listVehiclesForTenant");
    expect(dispatchRouter).toContain("requireActiveTenant");
    expect(dispatchRouter).toContain("assertTeamTenant");
    expect(formsRuntime).toContain("getIncidentForTenant");
    expect(formsRuntime).toContain("x-organization-id");
  });

  it("faz backfill apenas quando a organização pode ser determinada", () => {
    expect(tenantMigration).toContain("incident_tenant_scopes");
    expect(tenantMigration).toContain("vehicle_tenant_scopes");
    expect(tenantMigration).toMatch(/JOIN\s+`?teams`?/i);
    expect(tenantMigration).toMatch(/organization_id`?\s+IS\s+NOT\s+NULL/i);
    expect(tenantMigration).not.toMatch(/COALESCE\s*\([^)]*organization_id[^)]*,\s*1\s*\)/i);
  });

  it("envia a empresa ativa em todas as chamadas e oferece seleção no portal", () => {
    expect(clientMain).toContain("x-organization-id");
    expect(clientMain).toContain("dispatch.activeOrganizationId");
    expect(clientMain).toContain("TenantBoundaryShell");
    expect(tenantShell).toContain("dispatch.activeOrganizationId");
    expect(tenantShell).toMatch(/Empresa ativa|Selecione a empresa ativa/i);
  });
});
