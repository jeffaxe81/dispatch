import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { createWorkflowSlaOperationalRouter } from "./workflowSlaOperationalRouter";

function context(): TrpcContext {
  return {
    user: {
      id: 77,
      openId: "sla-viewer",
      name: "Supervisor SLA",
      email: "sla@example.com",
      loginMethod: "test",
      role: "user",
      operationalRole: "supervisor",
      teamId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: { "x-organization-id": "9" }, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function deps() {
  return {
    assertPermission: vi.fn(async () => undefined),
    requireActiveTenant: vi.fn(async () => 9),
    list: vi.fn(async () => [{ intentId: 11 }]),
    now: vi.fn(() => "2026-10-21T20:00:00.000Z"),
  };
}

describe("D-012J — SLA operational router", () => {
  it("resolve permissão, tenant e relógio no servidor", async () => {
    const d = deps();
    const caller = createWorkflowSlaOperationalRouter(d).createCaller(context());
    expect(await caller.list({ limit: 20 })).toEqual([{ intentId: 11 }]);

    expect(d.assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 77 }),
      "workflow_tasks.view",
    );
    expect(d.requireActiveTenant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 77 }),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(d.list).toHaveBeenCalledWith({
      organizationId: 9,
      limit: 20,
      now: "2026-10-21T20:00:00.000Z",
    });
  });

  it("rejeita organizationId controlado pelo cliente", async () => {
    const d = deps();
    const caller = createWorkflowSlaOperationalRouter(d).createCaller(context());
    await expect(caller.list({ limit: 20, organizationId: 999 } as never)).rejects.toThrow();
    expect(d.list).not.toHaveBeenCalled();
  });
});
