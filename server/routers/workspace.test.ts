import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";
import type { WorkspaceLayoutV2 } from "@shared/workspaceLayout";
import { createWorkspaceRouter } from "./workspace";

const layout: WorkspaceLayoutV2 = {
  id: "workspace:test",
  name: "default",
  version: 2,
  screens: [
    {
      screenId: "primary",
      name: "Principal",
      order: 0,
      mode: "primary",
      widgets: [
        { instanceId: "map-1", type: "operational-map", x: 0, y: 0, w: 8, h: 6, settings: {} },
      ],
    },
    {
      screenId: "screen-2",
      name: "Monitor 2",
      order: 1,
      mode: "external",
      widgets: [
        { instanceId: "incidents-1", type: "incidents", x: 0, y: 0, w: 6, h: 4, settings: {} },
      ],
    },
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

function dependencies() {
  return {
    resolveAccessContext: vi.fn(async () => ({
      tenantId: 10,
      userId: 7,
      allowedWidgetTypes: new Set(["operational-map", "incidents"] as const),
    })),
    service: {
      getOwnWorkspace: vi.fn(async () => layout),
      saveOwnWorkspace: vi.fn(async () => layout),
      resetOwnWorkspace: vi.fn(async () => layout),
    },
  };
}

describe("workspace tRPC router", () => {
  it("resolves tenant/user only from authenticated server context", async () => {
    const deps = dependencies();
    const caller = createWorkspaceRouter(deps).createCaller(context());

    await caller.saveOwn({ name: "default", layout });

    expect(deps.resolveAccessContext).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 7 }) }));
    expect(deps.service.saveOwnWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 10, userId: 7 }),
      "default",
      layout,
    );
  });

  it("rejects tenantId/userId supplied by request bodies", async () => {
    const caller = createWorkspaceRouter(dependencies()).createCaller(context());

    await expect(caller.saveOwn({ name: "default", layout, tenantId: 999 } as never)).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.getOwn({ name: "default", userId: 999 } as never)).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.getOwnScreen({ name: "default", screenId: "screen-2", tenantId: 999 } as never)).rejects.toBeInstanceOf(TRPCError);
  });

  it("returns only the requested authorized screen", async () => {
    const caller = createWorkspaceRouter(dependencies()).createCaller(context());

    expect(await caller.getOwnScreen({ name: "default", screenId: "screen-2" })).toEqual(layout.screens[1]);
  });

  it("returns NOT_FOUND for an unknown screen selector", async () => {
    const caller = createWorkspaceRouter(dependencies()).createCaller(context());

    await expect(caller.getOwnScreen({ name: "default", screenId: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns screen widgets already filtered by the server-side workspace service", async () => {
    const filteredLayout: WorkspaceLayoutV2 = {
      ...layout,
      screens: layout.screens.map(screen => ({
        ...screen,
        widgets: screen.widgets.filter(widget => widget.type === "operational-map"),
      })),
    };
    const deps = dependencies();
    deps.service.getOwnWorkspace.mockResolvedValue(filteredLayout);
    const caller = createWorkspaceRouter(deps).createCaller(context());

    const result = await caller.getOwnScreen({ name: "default", screenId: "screen-2" });
    expect(result.widgets).toEqual([]);
  });

  it("requires authentication and exposes get/save/reset", async () => {
    const deps = dependencies();
    deps.resolveAccessContext.mockImplementation(async ctx => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return { tenantId: 10, userId: ctx.user.id, allowedWidgetTypes: new Set(["operational-map", "incidents"] as const) };
    });
    const router = createWorkspaceRouter(deps);

    const caller = router.createCaller(context());
    expect(await caller.getOwn({ name: "default" })).toEqual(layout);
    expect(await caller.resetOwn({ name: "default" })).toEqual(layout);

    await expect(router.createCaller(context(false)).getOwn({ name: "default" })).rejects.toBeInstanceOf(TRPCError);
  });
});
