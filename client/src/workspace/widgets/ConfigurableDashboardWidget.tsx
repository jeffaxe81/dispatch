import React from "react";
import { trpc } from "@/lib/trpc";
import { parseWorkspaceWidgetSettings, type WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export const configurableDashboardMetricKeys = ["activeIncidents", "availableTeams", "averageResponseSeconds"] as const;
export type ConfigurableDashboardMetricKey = (typeof configurableDashboardMetricKeys)[number];

const metricKeySet = new Set<string>(configurableDashboardMetricKeys);

export function normalizeDashboardMetricKeys(metricKeys: readonly string[] | undefined): ConfigurableDashboardMetricKey[] {
  if (!metricKeys?.length) return [...configurableDashboardMetricKeys];
  const result: ConfigurableDashboardMetricKey[] = [];
  for (const key of metricKeys) {
    if (!metricKeySet.has(key)) continue;
    if (result.includes(key as ConfigurableDashboardMetricKey)) continue;
    result.push(key as ConfigurableDashboardMetricKey);
  }
  return result;
}

const metricLabels: Record<ConfigurableDashboardMetricKey, string> = {
  activeIncidents: "Ocorrências ativas",
  availableTeams: "Equipes disponíveis",
  averageResponseSeconds: "Resposta média",
};

function formatMetric(key: ConfigurableDashboardMetricKey, value: unknown) {
  if (key === "averageResponseSeconds") {
    const seconds = typeof value === "number" ? value : null;
    return seconds === null ? "—" : `${seconds}s`;
  }
  return typeof value === "number" ? String(value) : "—";
}

export function ConfigurableDashboardWidget({ widget }: { widget: WorkspaceWidgetInstance }) {
  const settings = parseWorkspaceWidgetSettings("configurable-dashboard", widget.settings) as { metricKeys?: string[] };
  const metricKeys = normalizeDashboardMetricKeys(settings.metricKeys);
  const query = trpc.dashboard.summary.useQuery(undefined, { retry: false });

  if (query.isLoading) return <WorkspaceWidgetFrame title="Dashboard configurável" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Dashboard configurável" state="error" error={query.error} />;
  if (!metricKeys.length) return <WorkspaceWidgetFrame title="Dashboard configurável" state="empty" />;

  const data = (query.data ?? {}) as Record<string, unknown>;
  return (
    <WorkspaceWidgetFrame title="Dashboard configurável">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metricKeys.map(key => (
          <article key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{metricLabels[key]}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{formatMetric(key, data[key])}</div>
          </article>
        ))}
      </div>
    </WorkspaceWidgetFrame>
  );
}
