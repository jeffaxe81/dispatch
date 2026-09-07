import { describe, expect, it } from "vitest";
import {
  getWorkspaceWidgetDefinition,
  listAllowedWorkspaceWidgets,
  workspaceWidgetRegistry,
} from "./widgetRegistry";

describe("workspace widget registry", () => {
  it("contains only the 15 registered D-010 widget types", () => {
    expect(Object.keys(workspaceWidgetRegistry).sort()).toEqual([
      "authorized-iframe",
      "configurable-dashboard",
      "dynamic-form",
      "incident-detail",
      "incidents",
      "kanban",
      "metrics",
      "neo-communication",
      "operational-map",
      "operational-timeline",
      "priority-queue",
      "resources",
      "sla-alerts",
      "teams",
      "work-shift",
    ]);
  });

  it("does not resolve arbitrary component or remote widget names", () => {
    expect(getWorkspaceWidgetDefinition("remote-component")).toBeNull();
    expect(getWorkspaceWidgetDefinition("https://example.invalid/widget.js")).toBeNull();
  });

  it("filters occurrence and resource widgets using effective permissions", () => {
    const widgets = listAllowedWorkspaceWidgets(new Set(["occurrences.view", "teams.view"]));
    expect(widgets.map(widget => widget.type)).toEqual(expect.arrayContaining([
      "operational-map",
      "metrics",
      "priority-queue",
      "incidents",
      "teams",
      "kanban",
      "incident-detail",
      "resources",
      "sla-alerts",
      "operational-timeline",
      "configurable-dashboard",
    ]));
    expect(widgets.some(widget => widget.type === "work-shift")).toBe(false);
    expect(widgets.some(widget => widget.type === "neo-communication")).toBe(false);
    expect(widgets.some(widget => widget.type === "authorized-iframe")).toBe(false);
    expect(widgets.some(widget => widget.type === "dynamic-form")).toBe(false);
  });

  it("requires embedded_apps.view for NEO and authorized iframe", () => {
    expect(listAllowedWorkspaceWidgets(new Set(["embedded_apps.view"])).map(widget => widget.type)).toEqual(
      expect.arrayContaining(["neo-communication", "authorized-iframe"]),
    );
    expect(listAllowedWorkspaceWidgets(new Set()).map(widget => widget.type)).not.toEqual(
      expect.arrayContaining(["neo-communication", "authorized-iframe"]),
    );
  });

  it("requires forms.view for dynamic forms", () => {
    expect(listAllowedWorkspaceWidgets(new Set(["forms.view"])).map(widget => widget.type)).toContain("dynamic-form");
    expect(listAllowedWorkspaceWidgets(new Set()).map(widget => widget.type)).not.toContain("dynamic-form");
  });

  it("keeps safe defaults for dimensions and settings", () => {
    const map = getWorkspaceWidgetDefinition("operational-map");
    expect(map).not.toBeNull();
    expect(map?.defaultSize).toEqual({ w: 8, h: 6 });
    expect(map?.minSize.w).toBeGreaterThan(0);
    expect(map?.minSize.h).toBeGreaterThan(0);
    expect(map?.defaultSettings).toEqual({});

    expect(getWorkspaceWidgetDefinition("neo-communication")?.defaultSettings).toEqual({ applicationId: "neo-interact" });
    expect(getWorkspaceWidgetDefinition("authorized-iframe")?.defaultSettings).toEqual({});
  });
});
