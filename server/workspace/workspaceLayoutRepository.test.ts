import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLayout, WorkspaceLayoutV2 } from "@shared/workspaceLayout";
import {
  DrizzleWorkspaceLayoutRepository,
  InMemoryWorkspaceLayoutRepository,
} from "./workspaceLayoutRepository";

const layoutV1: WorkspaceLayout = {
  id: "workspace:default",
  name: "default",
  version: 1,
  widgets: [
    { instanceId: "map-1", type: "operational-map", x: 0, y: 0, w: 8, h: 6, settings: {} },
  ],
};

const layoutV2: WorkspaceLayoutV2 = {
  id: "workspace:default-v2",
  name: "default",
  version: 2,
  screens: [
    {
      screenId: "primary",
      name: "Principal",
      order: 0,
      mode: "primary",
      widgets: [
        { instanceId: "map-2", type: "operational-map", x: 0, y: 0, w: 8, h: 6, settings: {} },
      ],
    },
    {
      screenId: "screen-2",
      name: "Monitor 2",
      order: 1,
      mode: "external",
      widgets: [],
    },
  ],
};

describe("WorkspaceLayoutRepository", () => {
  it("isolates layouts by tenant and user", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    await repository.saveOwn(10, 100, "default", layoutV2);

    expect(await repository.findOwn(10, 100, "default")).toEqual(layoutV2);
    expect(await repository.findOwn(11, 100, "default")).toBeNull();
    expect(await repository.findOwn(10, 101, "default")).toBeNull();
  });

  it("can read legacy v1 and persist v2 in the same repository contract", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    await repository.saveOwn(10, 100, "default", layoutV1);
    expect((await repository.findOwn(10, 100, "default"))?.version).toBe(1);

    await repository.saveOwn(10, 100, "default", layoutV2);
    expect(await repository.findOwn(10, 100, "default")).toEqual(layoutV2);
  });

  it("overwrites only the exact tenant/user/name tuple", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    await repository.saveOwn(10, 100, "default", layoutV2);
    await repository.saveOwn(10, 101, "default", { ...layoutV2, id: "workspace:other-user" });
    await repository.saveOwn(10, 100, "default", { ...layoutV2, id: "workspace:updated" });

    expect((await repository.findOwn(10, 100, "default"))?.id).toBe("workspace:updated");
    expect((await repository.findOwn(10, 101, "default"))?.id).toBe("workspace:other-user");
  });

  it("resets only the authenticated scope tuple", async () => {
    const repository = new InMemoryWorkspaceLayoutRepository();
    await repository.saveOwn(10, 100, "default", layoutV2);
    await repository.saveOwn(10, 101, "default", layoutV2);

    await repository.resetOwn(10, 100, "default");

    expect(await repository.findOwn(10, 100, "default")).toBeNull();
    expect(await repository.findOwn(10, 101, "default")).toEqual(layoutV2);
  });

  it("uses the drizzle adapter for persisted reads, writes and resets", async () => {
    const limit = vi.fn(async () => [{ layoutJson: layoutV2 }]);
    const whereSelect = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: whereSelect }));
    const select = vi.fn(() => ({ from }));

    const onDuplicateKeyUpdate = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onDuplicateKeyUpdate }));
    const insert = vi.fn(() => ({ values }));

    const whereDelete = vi.fn(async () => undefined);
    const deleteFn = vi.fn(() => ({ where: whereDelete }));

    const db = { select, insert, delete: deleteFn };
    const repository = new DrizzleWorkspaceLayoutRepository(async () => db as never);

    expect(await repository.findOwn(10, 100, "default")).toEqual(layoutV2);
    await repository.saveOwn(10, 100, "default", layoutV2);
    await repository.resetOwn(10, 100, "default");

    expect(select).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 10,
      userId: 100,
      name: "default",
      layoutVersion: 2,
      layoutJson: layoutV2,
    }));
    expect(onDuplicateKeyUpdate).toHaveBeenCalledWith({
      set: { layoutVersion: 2, layoutJson: layoutV2 },
    });
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the database is unavailable", async () => {
    const repository = new DrizzleWorkspaceLayoutRepository(async () => null);
    await expect(repository.findOwn(10, 100, "default")).rejects.toThrow("Banco de dados indisponível");
  });
});
