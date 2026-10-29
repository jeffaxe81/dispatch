import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  getAccessSnapshot: vi.fn(),
  listOperationLogs: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
  getAccessSnapshot: mocks.getAccessSnapshot,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  listOperationLogs: mocks.listOperationLogs,
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: {
      id: 37,
      openId: "scoped-auditor",
      name: "Auditor",
      email: "auditor@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "administrador",
      teamId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const scopedAssignment = {
  roleCode: "auditor",
  defaultScope: "organizacao" as const,
  organizationId: 7,
  organizationalUnitId: null,
  teamId: null,
};

describe("auditoria operacional global — isolamento RBAC/tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.getAccessSnapshot.mockResolvedValue({ assignments: [], permissions: new Set(["audit.view"]) });
    mocks.listOperationLogs.mockResolvedValue({ rows: [], total: 0 });
  });

  it("impede leitura geral quando o papel está limitado a uma organização", async () => {
    mocks.getAccessSnapshot.mockResolvedValueOnce({
      assignments: [scopedAssignment],
      permissions: new Set(["audit.view"]),
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.audit.operations({ page: 1, pageSize: 25 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 37 }), "audit.view");
    expect(mocks.listOperationLogs).not.toHaveBeenCalled();
  });

  it("nega papel misto global + organização para evitar herança de permissão ampliada", async () => {
    mocks.getAccessSnapshot.mockResolvedValueOnce({
      assignments: [
        { ...scopedAssignment, defaultScope: "global", organizationId: null },
        scopedAssignment,
      ],
      permissions: new Set(["audit.view"]),
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.audit.operations({ page: 1, pageSize: 25 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.listOperationLogs).not.toHaveBeenCalled();
  });

  it("permite a leitura geral quando existe papel global explicitamente autorizado", async () => {
    mocks.getAccessSnapshot.mockResolvedValueOnce({
      assignments: [{ ...scopedAssignment, defaultScope: "global", organizationId: null }],
      permissions: new Set(["audit.view"]),
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.audit.operations({ page: 1, pageSize: 25 })).resolves.toEqual({
      rows: [],
      total: 0,
    });
    expect(mocks.listOperationLogs).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
  });

  it("preserva a compatibilidade do administrador legado sem assignments", async () => {
    const caller = appRouter.createCaller(context());
    await caller.audit.operations({ page: 1, pageSize: 25, resourceType: "incident" });
    expect(mocks.listOperationLogs).toHaveBeenCalledWith({
      page: 1, pageSize: 25, resourceType: "incident",
    });
  });

  it("bloqueia acesso sem permissão antes de consultar logs", async () => {
    mocks.assertPermission.mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN" }));
    const caller = appRouter.createCaller(context());

    await expect(caller.audit.operations({ page: 1, pageSize: 25 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.getAccessSnapshot).not.toHaveBeenCalled();
    expect(mocks.listOperationLogs).not.toHaveBeenCalled();
  });

  it("falha de consulta ao escopo não pode resultar em logs globais", async () => {
    mocks.getAccessSnapshot.mockRejectedValueOnce(new Error("Banco indisponível"));
    const caller = appRouter.createCaller(context());

    await expect(caller.audit.operations({ page: 1, pageSize: 25 })).rejects.toThrow("Banco indisponível");
    expect(mocks.listOperationLogs).not.toHaveBeenCalled();
  });
});
