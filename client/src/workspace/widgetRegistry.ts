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
  kanban: {
    type: "kanban",
    title: "Kanban operacional",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 8, h: 6 },
    minSize: { w: 5, h: 4 },
    defaultSettings: { statuses: [], priorities: [] },
  },
  "incident-detail": {
    type: "incident-detail",
    title: "Detalhe da ocorrência",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 5, h: 5 },
    minSize: { w: 3, h: 3 },
    defaultSettings: { compact: false },
  },
  resources: {
    type: "resources",
    title: "Recursos operacionais",
    requiredPermissions: ["teams.view"],
    defaultSize: { w: 5, h: 5 },
    minSize: { w: 3, h: 3 },
    defaultSettings: { includeVehicles: true },
  },
  "sla-alerts": {
    type: "sla-alerts",
    title: "Alertas e SLA",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    defaultSettings: { riskMinutes: 15 },
  },
  "neo-communication": {
    type: "neo-communication",
    title: "Comunicação NEO",
    requiredPermissions: ["embedded_apps.view"],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
    defaultSettings: { applicationId: "neo-interact" },
  },
  "operational-timeline": {
    type: "operational-timeline",
    title: "Timeline operacional",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 5, h: 5 },
    minSize: { w: 3, h: 3 },
    defaultSettings: { mode: "summary" },
  },
  "dynamic-form": {
    type: "dynamic-form",
    title: "Formulário dinâmico",
    requiredPermissions: ["forms.view"],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
    defaultSettings: {},
  },
  "configurable-dashboard": {
    type: "configurable-dashboard",
    title: "Dashboard configurável",
    requiredPermissions: ["occurrences.view"],
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    defaultSettings: { metricKeys: [] },
  },
  "authorized-iframe": {
    type: "authorized-iframe",
    title: "Aplicação incorporada",
    requiredPermissions: ["embedded_apps.view"],
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
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
