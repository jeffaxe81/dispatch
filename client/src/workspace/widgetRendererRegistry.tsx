import React from "react";
import type { WorkspaceWidgetInstance, WorkspaceWidgetType } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "./WorkspaceWidgetFrame";
import { getWorkspaceWidgetDefinition } from "./widgetRegistry";

export type WorkspaceWidgetRendererProps = { widget: WorkspaceWidgetInstance };

function PlaceholderWorkspaceWidget({ widget }: WorkspaceWidgetRendererProps) {
  const definition = getWorkspaceWidgetDefinition(widget.type);
  return (
    <WorkspaceWidgetFrame title={definition?.title ?? "Widget"} state="empty" />
  );
}

const rendererRegistry: Partial<Record<WorkspaceWidgetType, React.ComponentType<WorkspaceWidgetRendererProps>>> = {
  kanban: PlaceholderWorkspaceWidget,
  "incident-detail": PlaceholderWorkspaceWidget,
  resources: PlaceholderWorkspaceWidget,
  "sla-alerts": PlaceholderWorkspaceWidget,
  "neo-communication": PlaceholderWorkspaceWidget,
  "operational-timeline": PlaceholderWorkspaceWidget,
  "dynamic-form": PlaceholderWorkspaceWidget,
  "configurable-dashboard": PlaceholderWorkspaceWidget,
  "authorized-iframe": PlaceholderWorkspaceWidget,
};

export function getWorkspaceWidgetRenderer(type: WorkspaceWidgetType): React.ComponentType<WorkspaceWidgetRendererProps> | null {
  return rendererRegistry[type] ?? null;
}
