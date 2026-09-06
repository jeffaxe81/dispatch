import { describe, expect, it } from "vitest";
import type { WorkspaceLayout } from "@shared/workspaceLayout";
import { InMemoryWorkspaceLayoutRepository } from "./workspaceLayoutRepository";

const layout: WorkspaceLayout = {
  id: "workspace:default",
  name: "default",
  version: 1,
  widgets: [
    { instanceId: "map-1", type: "operational-map", x: 0, y: 0, w: 8, h: 6, settings: {} },
  ],
};

describe("WorkspaceLayoutRepository", () => {
  it("isolates layouts by tenant and user", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    await repository.saveOwn(10, 100, "default", layout);

    expect(await repository.findOwn(10, 100, "default")).toEqual(layout);
    expect(await repository.findOwn(11, 100, "default")).toBeNull();
    expect(await repository.findOwn(10, 101, "default")).toBeNull();
  });

  it("overwrites only the exact tenant/user/name tuple", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    await repository.saveOwn(10, 100, "default", layout);
    await repository.saveOwn(10, 101, "default", { ...layout, id: "workspace:other-user" });
    await repository.saveOwn(10, 100, "default", { ...layout, id: "workspace:updated" });

    expect((await repository.findOwn(10, 100, "default"))?.id).toBe("workspace:updated");
    expect((await repository.findOwn(10, 101, "default"))?.id).toBe("workspace:other-user");
  });

  it("resets only the authenticated scope tuple", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    await repository.saveOwn(10, 100, "default", layout);
    await repository.saveOwn(10, 101, "default", layout);

    await repository.resetOwn(10, 100, "default");

    expect(await repository.findOwn(10, 100, "default")).toBeNull();
    expect(await repository.findOwn(10, 101, "default")).toEqual(layout);
  });
});
