import React from "react";
import { trpc } from "@/lib/trpc";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export type SlaAlertRow = {
  intentId: number;
  taskId: number;
  eventKind: "reminder" | "overdue" | "escalation";
  deliveryStatus: "pending" | "leased" | "dead_letter";
  taskStatus: "open" | "in_progress";
  assigneeUserId: number | null;
  scheduledAt: string;
  attempts: number;
  minutesFromNow: number;
  timing: "future" | "due";
};

const eventLabels: Record<SlaAlertRow["eventKind"], string> = {
  reminder: "Lembrete",
  overdue: "Vencimento",
  escalation: "Escalonamento",
};

const deliveryLabels: Record<SlaAlertRow["deliveryStatus"], string> = {
  pending: "Pendente",
  leased: "Reservado",
  dead_letter: "Quarentena",
};

function timingLabel(row: SlaAlertRow) {
  if (row.minutesFromNow > 0) return `em ${row.minutesFromNow} min`;
  if (row.minutesFromNow < 0) return `${Math.abs(row.minutesFromNow)} min vencido`;
  return "agora";
}

export function SlaAlertsWidgetView({ rows }: { rows: SlaAlertRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum alerta SLA operacional pendente.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map(row => (
        <article key={row.intentId} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-amber-800">
                Tarefa #{row.taskId} · {eventLabels[row.eventKind]}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-950">
                {deliveryLabels[row.deliveryStatus]}
              </div>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              {timingLabel(row)}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {row.assigneeUserId ? `Responsável #${row.assigneeUserId}` : "Sem responsável"} · tentativas {row.attempts}
          </p>
        </article>
      ))}
    </div>
  );
}

export function SlaAlertsWidget({ widget }: { widget: WorkspaceWidgetInstance }) {
  const settings = widget.settings as { limit?: number };
  const requestedLimit = settings.limit ?? 50;
  const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 100
    ? requestedLimit
    : 50;
  const query = trpc.workflowSlaOperational.list.useQuery({ limit });

  if (query.isLoading) return <WorkspaceWidgetFrame title="Alertas e SLA" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Alertas e SLA" state="error" error={query.error} />;

  const rows: SlaAlertRow[] = (query.data ?? []).map(row => ({
    intentId: row.intentId,
    taskId: row.taskId,
    eventKind: row.eventKind,
    deliveryStatus: row.deliveryStatus,
    taskStatus: row.taskStatus,
    assigneeUserId: row.assigneeUserId,
    scheduledAt: row.scheduledAt,
    attempts: row.attempts,
    minutesFromNow: row.minutesFromNow,
    timing: row.timing,
  }));

  return (
    <WorkspaceWidgetFrame title="Alertas e SLA">
      <SlaAlertsWidgetView rows={rows} />
    </WorkspaceWidgetFrame>
  );
}
