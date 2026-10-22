import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { createWorkflowSlaOperationalRouter } from "./workflowSlaOperationalRouter";

function context(active = true): TrpcContext {
  return {
    user: {
      id: 77, openId: "sla-supervisor", name: "Supervisor", email: "sla@example.com",
      loginMethod: "test", role: "user", operationalRole: "supervisor",
      teamId: null, active, createdAt: new Date(), updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: { "x-organization-id": "999" }, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function deps() {
  return {
    assertPermission: vi.fn(async () => undefined),
    requireActiveTenant: vi.fn(async () => 9),
    list: vi.fn(async () => []),
    now: vi.fn(() => "2026-10-22T19:00:00.000Z"),
  };
}

describe("D-012J J6 — diagnostic tRPC com tenant e RBAC resolvidos no servidor", () => {
  it("retorna disabled sem probes sintéticos ou contagens inventadas", async () => {
    const d = deps();
    const caller = createWorkflowSlaOperationalRouter(d).createCaller(context());
    expect(await caller.diagnostic({})).toEqual({
      status: "disabled", organizationId: 9,
      evaluatedAt: "2026-10-22T19:00:00.000Z",
      components: { scheduler: "unknown", adapter: "unknown" },
      backlog: null, reasons: ["feature_disabled"],
    });
    expect(d.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }), "workflow_tasks.view");
    expect(d.requireActiveTenant).toHaveBeenCalledTimes(1);
    expect(d.list).not.toHaveBeenCalled();
  });

  it("recusa tenant informado pelo cliente sem consultar dependências", async () => {
    const d = deps();
    const caller = createWorkflowSlaOperationalRouter(d).createCaller(context());
    await expect(caller.diagnostic({ organizationId: 10 } as never)).rejects.toThrow();
    expect(d.requireActiveTenant).not.toHaveBeenCalled();
  });

  it("bloqueia usuário inativo ou sem permissão antes de consultar tenant", async () => {
    const d = deps();
    const caller = createWorkflowSlaOperationalRouter(d).createCaller(context(false));
    await expect(caller.diagnostic({})).rejects.toThrow(/inativo/i);
    expect(d.requireActiveTenant).not.toHaveBeenCalled();

    const other = deps();
    other.assertPermission.mockRejectedValueOnce(new Error("permissão insuficiente"));
    const otherCaller = createWorkflowSlaOperationalRouter(other).createCaller(context());
    await expect(otherCaller.diagnostic({})).rejects.toThrow(/permissão insuficiente/i);
    expect(other.requireActiveTenant).not.toHaveBeenCalled();
  });
});
