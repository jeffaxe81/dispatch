import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  requireActiveTenant: vi.fn(),
  getIncidentForTenant: vi.fn(),
  assertTenantIncidentAuditAccess: vi.fn(),
  getIncidentAudit: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
}));
vi.mock("./tenantOperational", async importOriginal => ({
  ...(await importOriginal<typeof import("./tenantOperational")>()),
  requireActiveTenant: mocks.requireActiveTenant,
  getIncidentForTenant: mocks.getIncidentForTenant,
}));
vi.mock("./tenantAuditReadModel", async importOriginal => ({
  ...(await importOriginal<typeof import("./tenantAuditReadModel")>()),
  assertTenantIncidentAuditAccess: mocks.assertTenantIncidentAuditAccess,
}));
vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getIncidentAudit: mocks.getIncidentAudit,
}));

import { tenantAwareAppRouter } from "./tenantAwareAppRouter";

function caller() {
  return tenantAwareAppRouter.createCaller({
    user: {
      id: 91, role: "user", openId: "synthetic-auditor",
      active: true, operationalRole: "operador", teamId: null,
    } as TrpcContext["user"],
    req: { headers: { "x-organization-id": "101" }, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
}

describe("tenant incident audit: real router must fail closed before reading rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.requireActiveTenant.mockResolvedValue(101);
    mocks.getIncidentForTenant.mockResolvedValue({
      incident: {id: 12, assignedTeamId: 77},
    });
    mocks.assertTenantIncidentAuditAccess.mockResolvedValue(undefined);
    mocks.getIncidentAudit.mockResolvedValue([{
      audit: {
        id: 4, actorUserId: 7, action: "incident_updated",
        beforeData: { status: "triagem", requesterName: "Contato privado" },
        afterData: { status: "despachada", token: "segredo" },
      },
      actorName: "Identidade privada",
    }]);
  });

  it("denied audit permission stops at the first authorization boundary", async () => {
    mocks.assertPermission.mockRejectedValueOnce(new TRPCError({code:"FORBIDDEN"}));
    await expect(caller().incidents.audit({incidentId:12}))
      .rejects.toMatchObject({code:"FORBIDDEN"});
    expect(mocks.getIncidentForTenant).not.toHaveBeenCalled();
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });

  it("another organization's incident is not fetched or leaked", async () => {
    mocks.getIncidentForTenant.mockResolvedValueOnce(null);
    await expect(caller().incidents.audit({incidentId:12}))
      .rejects.toMatchObject({code:"NOT_FOUND"});
    expect(mocks.assertTenantIncidentAuditAccess).not.toHaveBeenCalled();
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });

  it("team-scoped audit denial prevents fetching the audit log", async () => {
    mocks.assertTenantIncidentAuditAccess.mockRejectedValueOnce(new TRPCError({code:"FORBIDDEN"}));
    await expect(caller().incidents.audit({incidentId:12}))
      .rejects.toMatchObject({code:"FORBIDDEN"});
    expect(mocks.assertTenantIncidentAuditAccess).toHaveBeenCalledWith({
      actorUserId:91,organizationId:101,assignedTeamId:77,
    });
    expect(mocks.getIncidentAudit).not.toHaveBeenCalled();
  });

  it("authorized tenant-scoped auditor sees only sanitized event metadata", async () => {
    const data=await caller().incidents.audit({incidentId:12});
    expect(mocks.assertTenantIncidentAuditAccess).toHaveBeenCalledWith({
      actorUserId:91,organizationId:101,assignedTeamId:77,
    });
    expect(mocks.getIncidentAudit).toHaveBeenCalledWith(12);
    expect(data).toHaveLength(1);
    expect(data[0].audit.actorUserId).toBeNull();
    expect(data[0].actorName).toBe("Usuário auditado");
    expect(data[0].audit.beforeData).toEqual({status:"triagem"});
    expect(data[0].audit.afterData).toEqual({status:"despachada"});
    expect(JSON.stringify(data)).not.toMatch(/Contato privado|segredo|Identidade privada/);
  });
});
