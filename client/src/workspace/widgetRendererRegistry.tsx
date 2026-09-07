import React from "react";
import type { WorkspaceWidgetInstance, WorkspaceWidgetType } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "./WorkspaceWidgetFrame";
import { getWorkspaceWidgetDefinition } from "./widgetRegistry";
import { KanbanWidget } from "./widgets/KanbanWidget";
import { IncidentDetailWidget } from "./widgets/IncidentDetailWidget";
import { ResourcesWidget } from "./widgets/ResourcesWidget";
import { SlaAlertsWidget } from "./widgets/SlaAlertsWidget";
import { OperationalTimelineWidget } from "./widgets/OperationalTimelineWidget";
import { NeoCommunicationWidget } from "./widgets/NeoCommunicationWidget";
import { AuthorizedIframeWidget } from "./widgets/AuthorizedIframeWidget";
import { DynamicFormWidget } from "./widgets/DynamicFormWidget";
import { ConfigurableDashboardWidget } from "./widgets/ConfigurableDashboardWidget";

export type WorkspaceWidgetRendererProps = { widget: WorkspaceWidgetInstance };

function PlaceholderWorkspaceWidget({ widget }: WorkspaceWidgetRendererProps) {
  const definition = getWorkspaceWidgetDefinition(widget.type);
  return (
    <WorkspaceWidgetFrame title={definition?.title ?? "Widget"} state="empty" />
  );
}

const rendererRegistry: Partial<Record<WorkspaceWidgetType, React.ComponentType<WorkspaceWidgetRendererProps>>> = {
  kanban: KanbanWidget,
  "incident-detail": IncidentDetailWidget,
  resources: ResourcesWidget,
  "sla-alerts": SlaAlertsWidget,
  "neo-communication": NeoCommunicationWidget,
  "operational-timeline": OperationalTimelineWidget,
  "dynamic-form": DynamicFormWidget,
  "configurable-dashboard": ConfigurableDashboardWidget,
  "authorized-iframe": AuthorizedIframeWidget,
};

export function getWorkspaceWidgetRenderer(type: WorkspaceWidgetType): React.ComponentType<WorkspaceWidgetRendererProps> | null {
  return rendererRegistry[type] ?? null;
}
