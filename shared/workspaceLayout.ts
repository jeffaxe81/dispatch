import { z } from "zod";

export const workspaceWidgetTypes = [
  "operational-map",
  "metrics",
  "priority-queue",
  "incidents",
  "teams",
  "work-shift",
] as const;

export type WorkspaceWidgetType = (typeof workspaceWidgetTypes)[number];

const workspaceWidgetPositionSchema = z.object({
  instanceId: z.string().min(1).max(120),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(24),
  h: z.number().int().min(1).max(24),
  settings: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const workspaceWidgetInstanceSchema = workspaceWidgetPositionSchema.extend({
  type: z.enum(workspaceWidgetTypes),
}).strict();

export type WorkspaceWidgetInstance = z.infer<typeof workspaceWidgetInstanceSchema>;

export const workspaceLayoutSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(80),
  version: z.literal(1),
  widgets: z.array(workspaceWidgetInstanceSchema).max(40),
}).strict();

export type WorkspaceLayout = z.infer<typeof workspaceLayoutSchema>;

const preferredDisplayHintSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  ordinal: z.number().int().min(0).optional(),
}).strict();

export type PreferredDisplayHint = z.infer<typeof preferredDisplayHintSchema>;

export const workspaceScreenSchema = z.object({
  screenId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(0),
  mode: z.enum(["primary", "external"]),
  preferredDisplay: preferredDisplayHintSchema.optional(),
  widgets: z.array(workspaceWidgetInstanceSchema).max(40),
}).strict();

export type WorkspaceScreen = z.infer<typeof workspaceScreenSchema>;

export const workspaceLayoutV2Schema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(80),
  version: z.literal(2),
  screens: z.array(workspaceScreenSchema).min(1).max(128),
}).strict().superRefine((layout, ctx) => {
  const primaryCount = layout.screens.filter(screen => screen.mode === "primary").length;
  if (primaryCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["screens"],
      message: "Workspace v2 deve possuir exatamente uma superfície primária.",
    });
  }

  const seenIds = new Set<string>();
  layout.screens.forEach((screen, index) => {
    if (seenIds.has(screen.screenId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["screens", index, "screenId"],
        message: "screenId duplicado no workspace.",
      });
    }
    seenIds.add(screen.screenId);
  });
});

export type WorkspaceLayoutV2 = z.infer<typeof workspaceLayoutV2Schema>;

const untrustedWorkspaceWidgetSchema = workspaceWidgetPositionSchema.extend({
  type: z.string().min(1).max(80),
}).strict();

const untrustedWorkspaceLayoutSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(80),
  version: z.literal(1),
  widgets: z.array(untrustedWorkspaceWidgetSchema).max(40),
}).strict();

const untrustedWorkspaceScreenSchema = z.object({
  screenId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(0),
  mode: z.enum(["primary", "external"]),
  preferredDisplay: preferredDisplayHintSchema.optional(),
  widgets: z.array(untrustedWorkspaceWidgetSchema).max(40),
}).strict();

const untrustedWorkspaceLayoutV2Schema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(80),
  version: z.literal(2),
  screens: z.array(untrustedWorkspaceScreenSchema).min(1).max(128),
}).strict();

function normalizeWidgets(
  widgets: z.infer<typeof untrustedWorkspaceWidgetSchema>[],
  allowedTypes: ReadonlySet<WorkspaceWidgetType>,
): WorkspaceWidgetInstance[] {
  return widgets
    .filter((widget): widget is typeof widget & { type: WorkspaceWidgetType } =>
      workspaceWidgetTypes.includes(widget.type as WorkspaceWidgetType) &&
      allowedTypes.has(widget.type as WorkspaceWidgetType),
    )
    .map(widget => workspaceWidgetInstanceSchema.parse(widget));
}

export function normalizeWorkspaceLayout(
  input: unknown,
  allowedTypes: ReadonlySet<WorkspaceWidgetType>,
): WorkspaceLayout {
  const parsed = untrustedWorkspaceLayoutSchema.parse(input);
  const widgets = normalizeWidgets(parsed.widgets, allowedTypes);
  return workspaceLayoutSchema.parse({ ...parsed, widgets });
}

export function migrateWorkspaceV1ToV2(input: unknown): WorkspaceLayoutV2 {
  const v1 = workspaceLayoutSchema.parse(input);
  return workspaceLayoutV2Schema.parse({
    id: v1.id,
    name: v1.name,
    version: 2,
    screens: [
      {
        screenId: "primary",
        name: "Principal",
        order: 0,
        mode: "primary",
        widgets: v1.widgets,
      },
    ],
  });
}

export function normalizeWorkspaceLayoutV2(
  input: unknown,
  allowedTypes: ReadonlySet<WorkspaceWidgetType>,
): WorkspaceLayoutV2 {
  const parsed = untrustedWorkspaceLayoutV2Schema.parse(input);
  const screens = parsed.screens.map(screen => ({
    ...screen,
    widgets: normalizeWidgets(screen.widgets, allowedTypes),
  }));
  return workspaceLayoutV2Schema.parse({ ...parsed, screens });
}
