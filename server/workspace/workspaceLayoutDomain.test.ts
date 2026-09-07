import { describe, expect, it } from "vitest";
import {
  migrateWorkspaceV1ToV2,
  normalizeWorkspaceLayout,
  normalizeWorkspaceLayoutV2,
  workspaceLayoutSchema,
  workspaceLayoutV2Schema,
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

const validV2Layout = {
  id: "workspace:user:default",
  name: "default",
  version: 2,
  screens: [
    {
      screenId: "primary",
      name: "Principal",
      order: 0,
      mode: "primary",
      widgets: validLayout.widgets,
    },
    {
      screenId: "map-wall",
      name: "Mapa",
      order: 1,
      mode: "external",
      widgets: [],
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

  it("migrates a v1 layout to one primary v2 screen without losing widgets", () => {
    expect(migrateWorkspaceV1ToV2(validLayout)).toEqual({
      id: validLayout.id,
      name: validLayout.name,
      version: 2,
      screens: [
        {
          screenId: "primary",
          name: "Principal",
          order: 0,
          mode: "primary",
          widgets: validLayout.widgets,
        },
      ],
    });
  });

  it("normalizes v1 input by migrating it to v2", () => {
    expect(normalizeWorkspaceLayoutV2(validLayout, allowedTypes)).toEqual({
      id: validLayout.id,
      name: validLayout.name,
      version: 2,
      screens: [
        {
          screenId: "primary",
          name: "Principal",
          order: 0,
          mode: "primary",
          widgets: validLayout.widgets,
        },
      ],
    });
  });

  it("requires exactly one primary screen", () => {
    expect(() => workspaceLayoutV2Schema.parse({
      ...validV2Layout,
      screens: validV2Layout.screens.map(screen => ({ ...screen, mode: "external" })),
    })).toThrow();

    expect(() => workspaceLayoutV2Schema.parse({
      ...validV2Layout,
      screens: validV2Layout.screens.map(screen => ({ ...screen, mode: "primary" })),
    })).toThrow();
  });

  it("rejects duplicate or empty screen ids", () => {
    expect(() => workspaceLayoutV2Schema.parse({
      ...validV2Layout,
      screens: validV2Layout.screens.map(screen => ({ ...screen, screenId: "same" })),
    })).toThrow();

    expect(() => workspaceLayoutV2Schema.parse({
      ...validV2Layout,
      screens: [{ ...validV2Layout.screens[0], screenId: "" }],
    })).toThrow();
  });

  it("filters unknown widgets after v2 migration/normalization", () => {
    const normalized = normalizeWorkspaceLayoutV2({
      ...validV2Layout,
      screens: [{
        ...validV2Layout.screens[0],
        widgets: [
          ...validLayout.widgets,
          {
            instanceId: "unsafe-2",
            type: "https://example.invalid/remote-widget.js",
            x: 0,
            y: 6,
            w: 3,
            h: 3,
            settings: {},
          },
        ],
      }],
    }, allowedTypes);

    expect(normalized.screens[0]?.widgets).toHaveLength(1);
    expect(normalized.screens[0]?.widgets[0]?.type).toBe("operational-map");
  });

  it("accepts many screens without a small logical monitor cap", () => {
    const screens = Array.from({ length: 12 }, (_, index) => ({
      screenId: index === 0 ? "primary" : `screen-${index}`,
      name: index === 0 ? "Principal" : `Monitor ${index + 1}`,
      order: index,
      mode: index === 0 ? "primary" as const : "external" as const,
      widgets: [],
    }));

    expect(workspaceLayoutV2Schema.parse({
      id: validV2Layout.id,
      name: validV2Layout.name,
      version: 2,
      screens,
    }).screens).toHaveLength(12);
  });
});
