import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";
import { createWorkspaceRouter } from "./workspace";

const layout = {
  id: "workspace:test",
  name: "default",
  version: 1 as const,
  widgets: [
    { instanceId: "map-1", type: "operational-map" as const, x: 0, y: 0, w: 8, h: 6, settings: {} },
  ],
};

function context(user = true): TrpcContext {
  return {
    user: user ? {
      id: 7,
      openId: "workspace-user",
      name: "Operador Workspace",
      email: "workspace@test.local",
      loginMethod: "test",
      role: "user",
      operationalRole: "operador",
      teamId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } : null,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("workspace tRPC router", () => {
  it("resolves tenant/user only from authenticated server context", async () => {
    const resolveAccessContext = vi.fn(async () => ({
      tenantId: 10,
      userId: 7,
      allowedWidgetTypes: new Set(["operational-map"] as const),
    }));
    const service = {
      getOwnWorkspace: vi.fn(async () => layout),
      saveOwnWorkspace: vi.fn(async () => layout),
      resetOwnWorkspace: vi.fn(async () => layout),
    };
    const caller = createWorkspaceRouter({ resolveAccessContext, service }).createCaller(context());

    await caller.saveOwn({ name: "default", layout });

    expect(resolveAccessContext).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 7 }) }));
    expect(service.saveOwnWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 10, userId: 7 }),
      "default",
      layout,
    );
  });

  it("rejects tenantId/userId supplied by the request body", async () => {
    const caller = createWorkspaceRouter({
      resolveAccessContext: vi.fn(async () => ({ tenantId: 10, userId: 7, allowedWidgetTypes: new Set(["operational-map"] as const) })),
      service: {
        getOwnWorkspace: vi.fn(async () => layout),
        saveOwnWorkspace: vi.fn(async () => layout),
        resetOwnWorkspace: vi.fn(async () => layout),
      },
    }).createCaller(context());

    await expect(caller.saveOwn({ name: "default", layout, tenantId: 999 } as never)).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.getOwn({ name: "default", userId: 999 } as never)).rejects.toBeInstanceOf(TRPCError);
  });

  it("requires authentication and exposes get/save/reset", async () => {
    const service = {
      getOwnWorkspace: vi.fn(async () => layout),
      saveOwnWorkspace: vi.fn(async () => layout),
      resetOwnWorkspace: vi.fn(async () => layout),
    };
    const router = createWorkspaceRouter({
      resolveAccessContext: vi.fn(async ctx => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return { tenantId: 10, userId: ctx.user.id, allowedWidgetTypes: new Set(["operational-map"] as const) };
      }),
      service,
    });

    const caller = router.createCaller(context());
    expect(await caller.getOwn({ name: "default" })).toEqual(layout);
    expect(await caller.resetOwn({ name: "default" })).toEqual(layout);

    await expect(router.createCaller(context(false)).getOwn({ name: "default" })).rejects.toBeInstanceOf(TRPCError);
  });
});
