import { describe, expect, it } from "vitest";
import {
  parseWorkspaceWidgetSettings,
  workspaceWidgetInstanceSchema,
  workspaceWidgetTypes,
} from "./workspaceLayout";

describe("D-010C workspace widget contract", () => {
  it("includes the nine D-010C widget types in the closed catalog", () => {
    expect(workspaceWidgetTypes).toEqual(expect.arrayContaining([
      "kanban",
      "incident-detail",
      "resources",
      "sla-alerts",
      "neo-communication",
      "operational-timeline",
      "dynamic-form",
      "configurable-dashboard",
      "authorized-iframe",
    ]));
  });

  it("still rejects arbitrary widget types", () => {
    expect(() => workspaceWidgetInstanceSchema.parse({
      instanceId: "bad",
      type: "remote-component",
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      settings: {},
    })).toThrow();
  });

  it("normalizes safe defaults and rejects unknown keys", () => {
    expect(parseWorkspaceWidgetSettings("kanban", {})).toEqual({ statuses: [], priorities: [] });
    expect(parseWorkspaceWidgetSettings("incident-detail", {})).toEqual({ compact: false });
    expect(parseWorkspaceWidgetSettings("resources", {})).toEqual({ includeVehicles: true });
    expect(parseWorkspaceWidgetSettings("sla-alerts", {})).toEqual({ riskMinutes: 15 });
    expect(parseWorkspaceWidgetSettings("neo-communication", {})).toEqual({ applicationId: "neo-interact" });
    expect(parseWorkspaceWidgetSettings("operational-timeline", {})).toEqual({ mode: "summary" });
    expect(parseWorkspaceWidgetSettings("dynamic-form", {})).toEqual({});
    expect(parseWorkspaceWidgetSettings("configurable-dashboard", {})).toEqual({ metricKeys: [] });
    expect(() => parseWorkspaceWidgetSettings("authorized-iframe", { applicationId: "neo-interact", src: "https://evil.invalid" })).toThrow();
  });

  it("validates bounded D-010C settings", () => {
    expect(parseWorkspaceWidgetSettings("sla-alerts", { riskMinutes: 30 })).toEqual({ riskMinutes: 30 });
    expect(() => parseWorkspaceWidgetSettings("sla-alerts", { riskMinutes: -1 })).toThrow();
    expect(parseWorkspaceWidgetSettings("authorized-iframe", { applicationId: "neo-interact" })).toEqual({ applicationId: "neo-interact" });
  });
});
