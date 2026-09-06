import { describe, expect, it } from "vitest";
import {
  getWorkspaceWidgetDefinition,
  listAllowedWorkspaceWidgets,
  workspaceWidgetRegistry,
} from "./widgetRegistry";

describe("workspace widget registry", () => {
  it("contains only the six registered D-010A widget types", () => {
    expect(Object.keys(workspaceWidgetRegistry).sort()).toEqual([
      "incidents",
      "metrics",
      "operational-map",
      "priority-queue",
      "teams",
      "work-shift",
    ]);
  });

  it("does not resolve arbitrary component or remote widget names", () => {
    expect(getWorkspaceWidgetDefinition("remote-component")).toBeNull();
    expect(getWorkspaceWidgetDefinition("https://example.invalid/widget.js")).toBeNull();
  });

  it("filters widgets using the existing effective permission codes", () => {
    const widgets = listAllowedWorkspaceWidgets(new Set(["occurrences.view", "teams.view"]));
    expect(widgets.map(widget => widget.type)).toEqual(expect.arrayContaining([
      "operational-map",
      "metrics",
      "priority-queue",
      "incidents",
      "teams",
    ]));
    expect(widgets.some(widget => widget.type === "work-shift")).toBe(false);
  });

  it("keeps safe defaults for dimensions and settings", () => {
    const map = getWorkspaceWidgetDefinition("operational-map");
    expect(map).not.toBeNull();
    expect(map?.defaultSize).toEqual({ w: 8, h: 6 });
    expect(map?.minSize.w).toBeGreaterThan(0);
    expect(map?.minSize.h).toBeGreaterThan(0);
    expect(map?.defaultSettings).toEqual({});
  });
});
