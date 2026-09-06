import React from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import IncidentFormsOperationalDock from "@/components/forms/IncidentFormsOperationalDock";
import IncidentDetailPage from "./IncidentDetailPage";
import AgentPage from "./AgentPage";

export function resolveActiveAgentIncidentId(rows: Array<{ incident: { id: number; status: string } }>) {
  return rows.find(({ incident }) => ["aceita", "em_atendimento", "pausada"].includes(incident.status))?.incident.id ?? null;
}

export function IncidentDetailWithFormsPage() {
  const [, params] = useRoute("/ocorrencias/:id");
  const incidentId = Number(params?.id);
  return <><IncidentDetailPage />{Number.isInteger(incidentId) && incidentId > 0 ? <IncidentFormsOperationalDock incidentId={incidentId} /> : null}</>;
}

export function AgentWithFormsPage() {
  const { user } = useAuth();
  const assignments = trpc.incidents.list.useQuery({ page: 1, pageSize: 50 }, { enabled: user?.operationalRole === "agente", retry: false });
  const incidentId = resolveActiveAgentIncidentId(assignments.data?.rows ?? []);
  return <><AgentPage />{incidentId ? <IncidentFormsOperationalDock incidentId={incidentId} /> : null}</>;
}
