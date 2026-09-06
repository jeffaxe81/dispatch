import { describe, expect, it } from "vitest";
import {
  normalizeWorkspaceLayout,
  workspaceLayoutSchema,
  type WorkspaceWidgetType,
} from "@shared/workspaceLayout";

const allowedTypes = new Set<WorkspaceWidgetType>([
  "operational-map",
  "metrics",
  "priority-queue",
  "incidents",
  "teams",
  "work-shift",
]);

const validLayout = {
  id: "workspace:user:default",
  name: "default",
  version: 1,
  widgets: [
    {
      instanceId: "map-1",
      type: "operational-map",
      x: 0,
      y: 0,
      w: 8,
      h: 6,
      settings: {},
    },
  ],
};

describe("workspaceLayout domain", () => {
  it("accepts a valid version 1 layout", () => {
    expect(workspaceLayoutSchema.parse(validLayout)).toEqual(validLayout);
  });

  it("rejects invalid dimensions", () => {
    expect(() =>
      workspaceLayoutSchema.parse({
        ...validLayout,
        widgets: [{ ...validLayout.widgets[0], w: 0 }],
      }),
    ).toThrow();
  });

  it("rejects unsupported layout versions", () => {
    expect(() => workspaceLayoutSchema.parse({ ...validLayout, version: 2 })).toThrow();
  });

  it("drops widget types that are not explicitly allowed", () => {
    const normalized = normalizeWorkspaceLayout(
      {
        ...validLayout,
        widgets: [
          ...validLayout.widgets,
          {
            instanceId: "unsafe-1",
            type: "remote-component",
            x: 0,
            y: 6,
            w: 4,
            h: 3,
            settings: { url: "https://example.invalid/component.js" },
          },
        ],
      },
      allowedTypes,
    );

    expect(normalized.widgets).toHaveLength(1);
    expect(normalized.widgets[0]?.type).toBe("operational-map");
  });
});
