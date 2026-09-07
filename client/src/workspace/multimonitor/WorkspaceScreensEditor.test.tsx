import { describe, expect, it } from "vitest";
import type { WorkspaceLayoutV2 } from "@shared/workspaceLayout";
import {
  addScreen,
  moveWidgetToScreen,
  removeScreen,
  renameScreen,
  reorderScreen,
  setPrimaryScreen,
} from "./WorkspaceScreensEditor";

function baseLayout(): WorkspaceLayoutV2 {
  return {
    id: "workspace-default",
    name: "default",
    version: 2,
    screens: [
      {
        screenId: "primary",
        name: "Principal",
        order: 0,
        mode: "primary",
        widgets: [
          { instanceId: "map-1", type: "operational-map", x: 0, y: 0, w: 12, h: 8, settings: {} },
          { instanceId: "metrics-1", type: "metrics", x: 0, y: 8, w: 6, h: 4, settings: {} },
        ],
      },
      {
        screenId: "ops-2",
        name: "Operação 2",
        order: 1,
        mode: "external",
        widgets: [],
      },
    ],
  };
}

describe("D-010B WorkspaceScreensEditor draft operations", () => {
  it("adds an external screen without mutating the loaded layout", () => {
    const loaded = baseLayout();
    const next = addScreen(loaded, { screenId: "neo", name: "Comunicação" });

    expect(next).not.toBe(loaded);
    expect(loaded.screens).toHaveLength(2);
    expect(next.screens).toHaveLength(3);
    expect(next.screens[2]).toMatchObject({ screenId: "neo", name: "Comunicação", order: 2, mode: "external" });
  });

  it("renames and reorders screens while normalizing sequential order", () => {
    const renamed = renameScreen(baseLayout(), "ops-2", "Supervisão");
    const reordered = reorderScreen(renamed, "ops-2", 0);

    expect(reordered.screens.map(screen => [screen.screenId, screen.name, screen.order])).toEqual([
      ["ops-2", "Supervisão", 0],
      ["primary", "Principal", 1],
    ]);
  });

  it("switches primary atomically so exactly one screen remains primary", () => {
    const next = setPrimaryScreen(baseLayout(), "ops-2");

    expect(next.screens.filter(screen => screen.mode === "primary")).toHaveLength(1);
    expect(next.screens.find(screen => screen.screenId === "ops-2")?.mode).toBe("primary");
    expect(next.screens.find(screen => screen.screenId === "primary")?.mode).toBe("external");
  });

  it("moves a widget between screens without duplicating it", () => {
    const next = moveWidgetToScreen(baseLayout(), "map-1", "ops-2");

    expect(next.screens.find(screen => screen.screenId === "primary")?.widgets.map(widget => widget.instanceId)).toEqual(["metrics-1"]);
    expect(next.screens.find(screen => screen.screenId === "ops-2")?.widgets.map(widget => widget.instanceId)).toEqual(["map-1"]);
  });

  it("requires explicit relocation before removing a non-empty screen", () => {
    const withWidgetOnExternal = moveWidgetToScreen(baseLayout(), "map-1", "ops-2");

    expect(() => removeScreen(withWidgetOnExternal, "ops-2")).toThrow("WORKSPACE_SCREEN_HAS_WIDGETS");

    const relocated = removeScreen(withWidgetOnExternal, "ops-2", { relocateWidgetsToScreenId: "primary" });
    expect(relocated.screens.map(screen => screen.screenId)).toEqual(["primary"]);
    expect(relocated.screens[0].widgets.map(widget => widget.instanceId).sort()).toEqual(["map-1", "metrics-1"]);
  });

  it("never permits removing the last screen", () => {
    const single: WorkspaceLayoutV2 = { ...baseLayout(), screens: [baseLayout().screens[0]] };
    expect(() => removeScreen(single, "primary")).toThrow("WORKSPACE_REQUIRES_SCREEN");
  });
});
