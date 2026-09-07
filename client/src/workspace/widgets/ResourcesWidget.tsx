import React from "react";
import { trpc } from "@/lib/trpc";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export type ResourcesWidgetRow = {
  id: number;
  code: string;
  name: string;
  status: string;
  vehiclePrefix?: string | null;
  vehicleType?: string | null;
};

export function ResourcesWidgetView({ rows, includeVehicles }: { rows: ResourcesWidgetRow[]; includeVehicles: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Nenhum recurso operacional disponível.</p>;
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div><div className="text-xs font-medium text-sky-700">{row.code}</div><div className="mt-1 text-sm font-semibold text-slate-950">{row.name}</div></div>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">{row.status.replaceAll("_", " ")}</span>
          </div>
          {includeVehicles && <p className="mt-2 text-xs text-slate-600">Viatura: {row.vehiclePrefix ? `${row.vehiclePrefix}${row.vehicleType ? ` · ${row.vehicleType}` : ""}` : "Não vinculada"}</p>}
        </article>
      ))}
    </div>
  );
}

export function ResourcesWidget({ widget }: { widget: WorkspaceWidgetInstance }) {
  const settings = widget.settings as { includeVehicles?: boolean };
  const query = trpc.teams.list.useQuery();
  if (query.isLoading) return <WorkspaceWidgetFrame title="Recursos operacionais" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Recursos operacionais" state="error" error={query.error} />;
  const rows: ResourcesWidgetRow[] = (query.data ?? []).map(({ team, vehiclePrefix, vehicleType }: any) => ({ id: team.id, code: team.code, name: team.name, status: team.status, vehiclePrefix, vehicleType }));
  return <WorkspaceWidgetFrame title="Recursos operacionais"><ResourcesWidgetView rows={rows} includeVehicles={settings.includeVehicles !== false} /></WorkspaceWidgetFrame>;
}
