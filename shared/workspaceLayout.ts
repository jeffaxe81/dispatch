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

const untrustedWorkspaceWidgetSchema = workspaceWidgetPositionSchema.extend({
  type: z.string().min(1).max(80),
}).strict();

const untrustedWorkspaceLayoutSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(80),
  version: z.literal(1),
  widgets: z.array(untrustedWorkspaceWidgetSchema).max(40),
}).strict();

export function normalizeWorkspaceLayout(
  input: unknown,
  allowedTypes: ReadonlySet<WorkspaceWidgetType>,
): WorkspaceLayout {
  const parsed = untrustedWorkspaceLayoutSchema.parse(input);
  const widgets = parsed.widgets
    .filter((widget): widget is typeof widget & { type: WorkspaceWidgetType } =>
      workspaceWidgetTypes.includes(widget.type as WorkspaceWidgetType) &&
      allowedTypes.has(widget.type as WorkspaceWidgetType),
    )
    .map(widget => workspaceWidgetInstanceSchema.parse(widget));

  return workspaceLayoutSchema.parse({ ...parsed, widgets });
}
