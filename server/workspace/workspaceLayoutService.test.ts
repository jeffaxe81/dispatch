import { describe, expect, it } from "vitest";
import type { WorkspaceLayout, WorkspaceLayoutV2, WorkspaceWidgetType } from "@shared/workspaceLayout";
import { InMemoryWorkspaceLayoutRepository } from "./workspaceLayoutRepository";
import {
  DEFAULT_OPERATIONAL_WORKSPACE,
  WorkspaceLayoutService,
} from "./workspaceLayoutService";

const allTypes = new Set<WorkspaceWidgetType>([
  "operational-map",
  "metrics",
  "priority-queue",
  "incidents",
  "teams",
  "work-shift",
]);

const context = { tenantId: 10, userId: 100, allowedWidgetTypes: allTypes };

const legacyV1: WorkspaceLayout = {
  id: "workspace:legacy",
  name: "default",
  version: 1,
  widgets: [
    { instanceId: "map-legacy", type: "operational-map", x: 0, y: 0, w: 8, h: 6, settings: {} },
  ],
};

const customV2: WorkspaceLayoutV2 = {
  id: "workspace:custom-v2",
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
      screenId: "operations-2",
      name: "Monitor 2",
      order: 1,
      mode: "external",
      widgets: [
        { instanceId: "incidents-1", type: "incidents", x: 0, y: 0, w: 6, h: 4, settings: {} },
      ],
    },
  ],
};

describe("WorkspaceLayoutService", () => {
  it("returns the v2 operational default when the user has no saved layout", async () => {
    const service = new WorkspaceLayoutService(new InMemoryWorkspaceLayoutRepository());
    const result = await service.getOwnWorkspace(context, "default");
    expect(result).toEqual(DEFAULT_OPERATIONAL_WORKSPACE);
    expect(result.version).toBe(2);
    expect(result.screens).toHaveLength(1);
    expect(result.screens[0]?.mode).toBe("primary");
  });

  it("migrates persisted v1 layouts to v2 on read without losing widgets", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    await repository.saveOwn(10, 100, "default", legacyV1);
    const service = new WorkspaceLayoutService(repository);

    const result = await service.getOwnWorkspace(context, "default");

    expect(result.version).toBe(2);
    expect(result.screens).toHaveLength(1);
    expect(result.screens[0]?.widgets).toEqual(legacyV1.widgets);
  });

  it("filters default and saved v2 layouts by server-authorized widget types", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    const service = new WorkspaceLayoutService(repository);
    const restricted = { ...context, allowedWidgetTypes: new Set<WorkspaceWidgetType>(["operational-map"]) };

    await repository.saveOwn(10, 100, "default", customV2);
    const result = await service.getOwnWorkspace(restricted, "default");

    expect(result.screens.flatMap(screen => screen.widgets).every(widget => restricted.allowedWidgetTypes.has(widget.type))).toBe(true);
    expect(result.screens.flatMap(screen => screen.widgets).some(widget => widget.type === "incidents")).toBe(false);
  });

  it("falls back to the safe v2 default when persisted layout data is corrupted", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    const service = new WorkspaceLayoutService(repository);
    (repository as any).records.set("10:100:default", { version: 999, screens: [] });

    expect(await service.getOwnWorkspace(context, "default")).toEqual(DEFAULT_OPERATIONAL_WORKSPACE);
  });

  it("saves normalized v2 only in the authenticated tenant/user scope and supports reset", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    const service = new WorkspaceLayoutService(repository);

    const saved = await service.saveOwnWorkspace(context, "default", customV2);
    expect(saved).toEqual(customV2);
    expect(await repository.findOwn(10, 100, "default")).toEqual(customV2);
    expect(await repository.findOwn(11, 100, "default")).toBeNull();

    const reset = await service.resetOwnWorkspace(context, "default");
    expect(reset).toEqual(DEFAULT_OPERATIONAL_WORKSPACE);
    expect(reset.version).toBe(2);
    expect(await repository.findOwn(10, 100, "default")).toBeNull();
  });
});
