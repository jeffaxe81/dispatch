import React from "react";
import type { SlaAlertRow } from "./SlaAlertsWidget";

type DiagnosticStatus = "disabled" | "ready" | "degraded" | "not_ready";
export type SlaReadinessDisplay = { status: DiagnosticStatus };

export type SlaAggregateMetrics = {
  pending: number;
  leased: number;
  deadLetter: number;
  expiredLeases: number;
  waitingRetries: number;
  overdue: number;
  maxLagMinutes: number;
  generatedAt: string;
};

export function validSlaAggregateMetrics(value: SlaAggregateMetrics | null): value is SlaAggregateMetrics {
  if (!value || typeof value.generatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.generatedAt)) return false;
  const { pending, leased, deadLetter, expiredLeases, waitingRetries, overdue, maxLagMinutes } = value;
  const values = [pending, leased, deadLetter, expiredLeases, waitingRetries, overdue, maxLagMinutes];
  return values.every(n => Number.isSafeInteger(n) && n >= 0)
    && Number.isSafeInteger(pending + leased + deadLetter)
    && expiredLeases <= leased && waitingRetries <= pending
    && overdue <= pending + leased + deadLetter;
}

const labels: Record<DiagnosticStatus, string> = {
  disabled: "Prontidão não habilitada",
  ready: "Prontidão diagnóstica: pronta (homologação)",
  degraded: "Prontidão diagnóstica: degradada (homologação)",
  not_ready: "Prontidão diagnóstica: não pronta (homologação)",
};

export function summarizeSlaVisibleRows(rows: readonly SlaAlertRow[]) {
  return {
    returned: rows.length,
    pending: rows.filter(row => row.deliveryStatus === "pending").length,
    leased: rows.filter(row => row.deliveryStatus === "leased").length,
    quarantine: rows.filter(row => row.deliveryStatus === "dead_letter").length,
    due: rows.filter(row => row.timing === "due").length,
  };
}

/** Counts from the capped, client-filtered list are never global backlog totals. */
export function SlaSupervisionSummary({
  rows,
  limit,
  diagnostic,
  diagnosticLoading = false,
  diagnosticError = false,
  metrics = null,
  metricsLoading = false,
  metricsError = false,
}: {
  rows: readonly SlaAlertRow[];
  limit: number;
  diagnostic: SlaReadinessDisplay | null;
  diagnosticLoading?: boolean;
  diagnosticError?: boolean;
  metrics?: SlaAggregateMetrics | null;
  metricsLoading?: boolean;
  metricsError?: boolean;
}) {
  const sample = summarizeSlaVisibleRows(rows);
  const status = diagnostic?.status;
  const message = diagnosticError || (!diagnosticLoading && (!status || !Object.hasOwn(labels, status)))
    ? "Diagnóstico de prontidão indisponível"
    : diagnosticLoading ? "Consultando diagnóstico de prontidão"
    : labels[status as DiagnosticStatus];

  return (
    <section aria-label="Supervisão SLA (somente leitura)" className="mb-4 space-y-3">
      <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800">
        {message}
      </div>
      <div className="rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900">Totais operacionais por empresa</h3>
        {metricsError || (!metricsLoading && !validSlaAggregateMetrics(metrics)) ? (
          <p className="mt-1 text-xs text-slate-600">Totais operacionais indisponíveis.</p>
        ) : metricsLoading ? (
          <p className="mt-1 text-xs text-slate-600">Calculando totais operacionais…</p>
        ) : metrics && validSlaAggregateMetrics(metrics) ? (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["Pendentes", metrics.pending],
                ["Reservados", metrics.leased],
                ["Quarentena", metrics.deadLetter],
                ["Vencidos", metrics.overdue],
                ["Leases expirados", metrics.expiredLeases],
                ["Retentativas aguardando", metrics.waitingRetries],
                ["Maior atraso (min)", metrics.maxLagMinutes],
              ] as const).map(([label, count]) => (
                <div key={label} className="rounded-md bg-slate-50 p-2">
                  <dt className="text-xs text-slate-600">{label}</dt>
                  <dd className="text-lg font-semibold text-slate-900">{count}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-slate-500">Agregação completa das intenções operacionais elegíveis, no tenant autorizado.</p>
          </>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-slate-600">
          Recorte filtrado: {sample.returned} registro(s) de uma consulta limitada a {limit}.
          Estes valores não representam o total da fila SLA.
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ["Pendentes", sample.pending],
            ["Reservados", sample.leased],
            ["Quarentena", sample.quarantine],
            ["Vencidos", sample.due],
          ] as const).map(([label, count]) => (
            <div key={label} className="rounded-lg border border-slate-200 p-2">
              <dt className="text-xs text-slate-600">{label}</dt>
              <dd className="text-lg font-semibold text-slate-900">{count}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
