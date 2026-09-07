import React from "react";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export const configurableDashboardMetricKeys = ["activeIncidents", "availableTeams", "averageResponseSeconds"] as const;
export type ConfigurableDashboardMetricKey = (typeof configurableDashboardMetricKeys)[number];

export function normalizeDashboardMetricKeys(_metricKeys: readonly string[] | undefined): ConfigurableDashboardMetricKey[] {
  return [];
}

export function ConfigurableDashboardWidget({ widget: _widget }: { widget: WorkspaceWidgetInstance }) {
  return <WorkspaceWidgetFrame title="Dashboard configurável" state="empty" />;
}
