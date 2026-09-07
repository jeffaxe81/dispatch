import React from "react";
import { trpc } from "@/lib/trpc";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export type SlaAlertRow = { id: number; code: string; category: string; priority: string; ageMinutes: number };

export function SlaAlertsWidgetView({ rows, riskMinutes }: { rows: SlaAlertRow[]; riskMinutes: number }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Nenhum alerta de tempo operacional no limiar configurado.</p>;
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <article key={row.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold text-amber-800">{row.code} · {row.priority}</div><div className="mt-1 text-sm font-semibold text-slate-950">{row.category}</div></div><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">{row.ageMinutes} min</span></div>
          <p className="mt-2 text-xs text-slate-600">Limiar de atenção: {riskMinutes} min.</p>
        </article>
      ))}
    </div>
  );
}

export function SlaAlertsWidget({ widget }: { widget: WorkspaceWidgetInstance }) {
  const settings = widget.settings as { riskMinutes?: number };
  const riskMinutes = settings.riskMinutes ?? 15;
  const query = trpc.incidents.list.useQuery({ page: 1, pageSize: 50 });
  if (query.isLoading) return <WorkspaceWidgetFrame title="Alertas e SLA" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Alertas e SLA" state="error" error={query.error} />;
  const now = Date.now();
  const rows: SlaAlertRow[] = (query.data?.rows ?? []).map(({ incident }: any) => ({
    id: incident.id,
    code: incident.code,
    category: incident.category,
    priority: incident.priority,
    status: incident.status,
    ageMinutes: Math.max(0, Math.floor((now - new Date(incident.createdAt).getTime()) / 60000)),
  })).filter((row: SlaAlertRow & { status?: string }) => row.status !== "concluida" && row.status !== "cancelada" && row.ageMinutes >= riskMinutes);
  return <WorkspaceWidgetFrame title="Alertas e SLA"><SlaAlertsWidgetView rows={rows} riskMinutes={riskMinutes} /></WorkspaceWidgetFrame>;
}
