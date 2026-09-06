import { describe, expect, it } from "vitest";
import type { WorkspaceWidgetType } from "@shared/workspaceLayout";
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

describe("WorkspaceLayoutService", () => {
  it("returns the operational default when the user has no saved layout", async () => {
    const service = new WorkspaceLayoutService(new InMemoryWorkspaceLayoutRepository());
    expect(await service.getOwnWorkspace(context, "default")).toEqual(DEFAULT_OPERATIONAL_WORKSPACE);
  });

  it("filters default and saved layouts by server-authorized widget types", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    const service = new WorkspaceLayoutService(repository);
    const restricted = { ...context, allowedWidgetTypes: new Set<WorkspaceWidgetType>(["operational-map", "incidents"]) };

    await repository.saveOwn(10, 100, "default", DEFAULT_OPERATIONAL_WORKSPACE);
    const result = await service.getOwnWorkspace(restricted, "default");

    expect(result.widgets.every(widget => restricted.allowedWidgetTypes.has(widget.type))).toBe(true);
    expect(result.widgets.some(widget => widget.type === "teams")).toBe(false);
  });

  it("falls back when persisted layout data is corrupted", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    const service = new WorkspaceLayoutService(repository);
    await repository.saveOwn(10, 100, "default", { ...DEFAULT_OPERATIONAL_WORKSPACE, version: 1 } as never);
    (repository as any).records.set("10:100:default", { version: 999, widgets: [] });

    expect(await service.getOwnWorkspace(context, "default")).toEqual(DEFAULT_OPERATIONAL_WORKSPACE);
  });

  it("persists only in the authenticated tenant/user scope and supports reset", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    const service = new WorkspaceLayoutService(repository);
    const custom = {
      ...DEFAULT_OPERATIONAL_WORKSPACE,
      id: "workspace:custom",
      widgets: DEFAULT_OPERATIONAL_WORKSPACE.widgets.slice(0, 2),
    };

    await service.saveOwnWorkspace(context, "default", custom);
    expect((await repository.findOwn(10, 100, "default"))?.id).toBe("workspace:custom");
    expect(await repository.findOwn(11, 100, "default")).toBeNull();

    await service.resetOwnWorkspace(context, "default");
    expect(await repository.findOwn(10, 100, "default")).toBeNull();
  });
});
