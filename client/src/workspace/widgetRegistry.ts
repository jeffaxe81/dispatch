import type { WorkspaceWidgetType } from "@shared/workspaceLayout";

export type WorkspaceWidgetDefinition = {
  type: WorkspaceWidgetType;
  title: string;
  requiredPermissions: readonly string[];
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  defaultSettings: Readonly<Record<string, unknown>>;
};

export const workspaceWidgetRegistry: Record<WorkspaceWidgetType, WorkspaceWidgetDefinition> = {
  "operational-map": {
    type: "operational-map",
    title: "Mapa operacional",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 8, h: 6 },
    minSize: { w: 4, h: 4 },
    defaultSettings: {},
  },
  metrics: {
    type: "metrics",
    title: "Indicadores",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 4, h: 2 },
    minSize: { w: 2, h: 2 },
    defaultSettings: {},
  },
  "priority-queue": {
    type: "priority-queue",
    title: "Fila prioritária",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    defaultSettings: {},
  },
  incidents: {
    type: "incidents",
    title: "Ocorrências",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    defaultSettings: {},
  },
  teams: {
    type: "teams",
    title: "Equipes",
    requiredPermissions: ["teams.view"],
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    defaultSettings: {},
  },
  "work-shift": {
    type: "work-shift",
    title: "Jornada",
    requiredPermissions: ["work_shifts.view"],
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    defaultSettings: {},
  },
};

export function getWorkspaceWidgetDefinition(type: string): WorkspaceWidgetDefinition | null {
  return Object.prototype.hasOwnProperty.call(workspaceWidgetRegistry, type)
    ? workspaceWidgetRegistry[type as WorkspaceWidgetType]
    : null;
}

export function listAllowedWorkspaceWidgets(
  permissions: ReadonlySet<string>,
): WorkspaceWidgetDefinition[] {
  return Object.values(workspaceWidgetRegistry).filter(definition =>
    definition.requiredPermissions.every(permission => permissions.has(permission)),
  );
}
