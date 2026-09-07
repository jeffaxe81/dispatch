import React from "react";
import { trpc } from "@/lib/trpc";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";
import { useWorkspaceSurfaceContext } from "../context/WorkspaceSurfaceContext";

export type IncidentDetailWidgetIncident = { code: string; category: string; status: string; priority: string; address: string; description: string };

export function IncidentDetailWidgetView({ incident, teamCode, vehiclePrefix }: { incident: IncidentDetailWidgetIncident | null; teamCode?: string | null; vehiclePrefix?: string | null }) {
  if (!incident) return <p className="text-sm text-slate-500">Selecione uma ocorrência nesta superfície para exibir os detalhes.</p>;
  return (
    <div className="space-y-3 text-sm">
      <div><span className="text-xs font-semibold uppercase tracking-wide text-sky-700">{incident.code}</span><h3 className="mt-1 text-base font-semibold text-slate-950">{incident.category}</h3></div>
      <dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-slate-500">Situação</dt><dd className="font-medium text-slate-800">{incident.status.replaceAll("_", " ")}</dd></div><div><dt className="text-slate-500">Prioridade</dt><dd className="font-medium text-slate-800">{incident.priority}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Local</dt><dd className="font-medium text-slate-800">{incident.address}</dd></div><div><dt className="text-slate-500">Equipe</dt><dd className="font-medium text-slate-800">{teamCode ?? "Não atribuída"}</dd></div><div><dt className="text-slate-500">Viatura</dt><dd className="font-medium text-slate-800">{vehiclePrefix ?? "—"}</dd></div></dl>
      <p className="whitespace-pre-wrap leading-6 text-slate-700">{incident.description}</p>
    </div>
  );
}

export function IncidentDetailWidget({ widget: _widget }: { widget: WorkspaceWidgetInstance }) {
  const { selection } = useWorkspaceSurfaceContext();
  const incidentId = selection.incidentId;
  const query = trpc.incidents.get.useQuery({ incidentId: incidentId ?? 0 }, { enabled: Boolean(incidentId) });
  if (!incidentId) return <WorkspaceWidgetFrame title="Detalhe da ocorrência" state="empty" />;
  if (query.isLoading) return <WorkspaceWidgetFrame title="Detalhe da ocorrência" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Detalhe da ocorrência" state="error" error={query.error} />;
  const incident = query.data?.incident ?? null;
  return <WorkspaceWidgetFrame title="Detalhe da ocorrência"><IncidentDetailWidgetView incident={incident ? { code: incident.code, category: incident.category, status: incident.status, priority: incident.priority, address: incident.address, description: incident.description } : null} teamCode={query.data?.teamCode} vehiclePrefix={query.data?.vehiclePrefix} /></WorkspaceWidgetFrame>;
}
