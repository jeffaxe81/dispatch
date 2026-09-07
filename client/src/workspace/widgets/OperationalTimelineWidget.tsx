import React from "react";
import { trpc } from "@/lib/trpc";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";
import { useWorkspaceSurfaceContext } from "../context/WorkspaceSurfaceContext";

export type OperationalTimelineEvent = { id: number; message: string; createdAt: Date | string; actorName?: string | null; teamCode?: string | null };

export function OperationalTimelineWidgetView({ events }: { events: OperationalTimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">Nenhum evento disponível para a ocorrência selecionada.</p>;
  return (
    <ol className="space-y-3">
      {events.map(event => (
        <li key={event.id} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600" />
          <div><p className="text-sm text-slate-800">{event.message}</p><p className="mt-1 text-xs text-slate-500">{new Date(event.createdAt).toLocaleString("pt-BR")} · {event.actorName ?? "Sistema"}{event.teamCode ? ` · ${event.teamCode}` : ""}</p></div>
        </li>
      ))}
    </ol>
  );
}

export function OperationalTimelineWidget({ widget: _widget }: { widget: WorkspaceWidgetInstance }) {
  const { selection } = useWorkspaceSurfaceContext();
  const incidentId = selection.incidentId;
  const query = trpc.incidents.timeline.useQuery({ incidentId: incidentId ?? 0 }, { enabled: Boolean(incidentId) });
  if (!incidentId) return <WorkspaceWidgetFrame title="Timeline operacional" state="empty" />;
  if (query.isLoading) return <WorkspaceWidgetFrame title="Timeline operacional" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Timeline operacional" state="error" error={query.error} />;
  const events: OperationalTimelineEvent[] = (query.data ?? []).map(({ event, actorName, teamCode }: any) => ({ id: event.id, message: event.message, createdAt: event.createdAt, actorName, teamCode }));
  return <WorkspaceWidgetFrame title="Timeline operacional"><OperationalTimelineWidgetView events={events} /></WorkspaceWidgetFrame>;
}
