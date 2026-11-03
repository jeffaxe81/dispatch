import React from "react";

export type IncidentFormBinding = {id: number; formId: number; formVersionId: number; name?: string | null; contextId: string};
export type FormSupervisorReview = { revision: number; decision: "approved" | "returned"; reason: string; reviewerUserId?: number; reviewedAt?: Date | string };
export type IncidentFormSubmission = {id: number; formId: number; formVersionId: number; status: "in_progress" | "submitted" | "corrected"; revision: number; review?: FormSupervisorReview | null};
export type IncidentFormState = "not_started" | IncidentFormSubmission["status"];
export type IncidentFormItem = IncidentFormBinding & {state: IncidentFormState; submissionId?: number; revision?: number; review?: FormSupervisorReview | null};
const stateLabels: Record<IncidentFormState,string> = {
  not_started: "Não iniciado", in_progress: "Em preenchimento", submitted: "Enviado", corrected: "Corrigido",
};
export function deriveIncidentFormItems(bindings: IncidentFormBinding[], submissions: IncidentFormSubmission[]): IncidentFormItem[] {
  return bindings.map(binding => {
    const related = submissions.filter(item => item.formId === binding.formId && item.formVersionId === binding.formVersionId)
      .sort((a,b) => b.revision - a.revision || b.id - a.id);
    const current = related[0];
    return {...binding, state: current?.status ?? "not_started", submissionId: current?.id, revision: current?.revision, review: current?.review ?? null};
  });
}
/** F030 preflight is READ ONLY and never approves an incident transition. */
export function deriveIncidentFormReadiness(items: readonly IncidentFormItem[]) {
  const completed = items.filter(item => (item.state === "submitted" || item.state === "corrected") && item.review?.decision !== "returned").length;
  const pending = items.filter(item => item.state === "not_started" || item.state === "in_progress" || item.review?.decision === "returned");
  return {total: items.length, completed, pending, allSubmitted: items.length > 0 && pending.length === 0};
}
export function IncidentFormsPanel({bindings, submissions, onOpen, readOnly = false}: {
  bindings: IncidentFormBinding[];
  submissions: IncidentFormSubmission[];
  onOpen: (item: IncidentFormItem) => void;
  readOnly?: boolean;
}) {
  const items = deriveIncidentFormItems(bindings, submissions);
  const readiness = deriveIncidentFormReadiness(items);
  return <section aria-label="Formulários da ocorrência" className="rounded-xl border border-slate-200 bg-white p-4">
    <div>
      <h2 className="font-semibold text-slate-950">Formulários operacionais</h2>
      <p className="mt-1 text-sm text-slate-500">O preenchimento é independente do status da ocorrência e não executa transições automáticas.</p>
    </div>
    {readiness.total > 0 && <div role="status" aria-label="Conferência de preenchimento dos formulários" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-800">{readiness.completed} de {readiness.total} formulário(s) enviado(s) ou corrigido(s).</p>
      {readiness.pending.length > 0 ?
        <p className="mt-1 text-xs text-amber-800">{readiness.pending.length} formulário(s) ainda não finalizado(s). Verifique antes de encerrar a ocorrência.</p> :
        <p className="mt-1 text-xs text-emerald-800">Todos os formulários vinculados estão enviados ou corrigidos.</p>}
      <p className="mt-1 text-xs text-slate-600">Conferência informativa. Não equivale à revisão de um supervisor nem libera ou bloqueia o encerramento no servidor.</p>
    </div>}
    <div className="mt-4 space-y-3">
      {items.map(item => {
        const name = item.name?.trim() || "Formulário #" + item.formId;
        return <article key={item.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-medium text-slate-900">{name}</h3>
            <p className="mt-1 text-xs text-slate-500">Versão {item.formVersionId}{item.revision ? " · revisão " + item.revision : ""}</p></div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{stateLabels[item.state]}</span>
            {item.review?.decision === "approved" && <span className="text-xs font-semibold text-emerald-700">Aprovado pelo supervisor</span>}
            {item.review?.decision === "returned" && <span className="text-xs font-semibold text-amber-800">Devolvido para correção</span>}
            <button type="button" disabled={readOnly} onClick={() => onOpen(item)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label={"Abrir formulário " + name}>Abrir formulário</button>
          </div>
        </article>;
      })}
      {items.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">Nenhum formulário operacional vinculado a esta ocorrência.</p>}
    </div>
  </section>;
}
export default IncidentFormsPanel;
