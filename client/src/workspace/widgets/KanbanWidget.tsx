import React from "react";
import { trpc } from "@/lib/trpc";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";
import { useWorkspaceSurfaceContext } from "../context/WorkspaceSurfaceContext";

export type KanbanWidgetRow = { id: number; code: string; category: string; status: string; priority: string };

export function KanbanWidgetView({ rows, onSelectIncident }: { rows: KanbanWidgetRow[]; onSelectIncident(id: number): void }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Nenhuma ocorrência disponível para os filtros atuais.</p>;
  const groups = new Map<string, KanbanWidgetRow[]>();
  for (const row of rows) groups.set(row.status, [...(groups.get(row.status) ?? []), row]);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[...groups.entries()].map(([status, items]) => (
        <section key={status} className="rounded-xl bg-slate-50 p-3" aria-label={status}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{status.replaceAll("_", " ")}</h3>
          <div className="mt-2 space-y-2">
            {items.map(item => (
              <button key={item.id} type="button" onClick={() => onSelectIncident(item.id)} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-sky-300" aria-label={`${item.code} ${item.category}`}>
                <div className="text-xs font-medium text-sky-700">{item.code} · {item.priority}</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{item.category}</div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function KanbanWidget({ widget }: { widget: WorkspaceWidgetInstance }) {
  const { selectIncident } = useWorkspaceSurfaceContext();
  const settings = widget.settings as { statuses?: string[]; priorities?: string[] };
  const query = trpc.incidents.list.useQuery({ page: 1, pageSize: 50 });
  if (query.isLoading) return <WorkspaceWidgetFrame title="Kanban operacional" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Kanban operacional" state="error" error={query.error} />;
  const rows: KanbanWidgetRow[] = (query.data?.rows ?? []).map(({ incident }: any) => ({ id: incident.id, code: incident.code, category: incident.category, status: incident.status, priority: incident.priority }))
    .filter(row => !settings.statuses?.length || settings.statuses.includes(row.status))
    .filter(row => !settings.priorities?.length || settings.priorities.includes(row.priority));
  return <WorkspaceWidgetFrame title="Kanban operacional"><KanbanWidgetView rows={rows} onSelectIncident={selectIncident} /></WorkspaceWidgetFrame>;
}
