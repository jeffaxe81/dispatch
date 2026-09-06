import React, { useMemo, useState } from "react";
import type { FormAnswers, FormSchemaDefinition } from "@shared/forms";
import { trpc } from "@/lib/trpc";
import { IncidentFormsPanel, deriveIncidentFormItems, type IncidentFormItem } from "./IncidentFormsPanel";
import { IncidentFormWorkspace } from "./IncidentFormWorkspace";

type HydratedBinding = {
  id: number;
  formId: number;
  formVersionId: number;
  name?: string | null;
  contextId: string;
  definition: FormSchemaDefinition;
};

type OperationalSubmission = {
  id: number;
  formId: number;
  formVersionId: number;
  status: "in_progress" | "submitted" | "corrected";
  revision?: number | null;
  answers?: FormAnswers | null;
};

export function activeSubmissionFor(item: IncidentFormItem, submissions: OperationalSubmission[]) {
  return submissions
    .filter(submission => submission.formId === item.formId && submission.formVersionId === item.formVersionId)
    .sort((a, b) => Number(b.revision ?? 1) - Number(a.revision ?? 1) || b.id - a.id)[0] ?? null;
}

export function IncidentFormsOperationalDock({ incidentId }: { incidentId: number }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<IncidentFormItem | null>(null);
  const validIncident = Number.isInteger(incidentId) && incidentId > 0;
  const query = trpc.forms.forIncident.useQuery({ incidentId: String(incidentId) }, { enabled: validIncident && open, retry: false });
  const access = trpc.access.me.useQuery(undefined, { enabled: open, retry: false });
  const start = trpc.forms.startSubmission.useMutation();
  const submit = trpc.forms.submit.useMutation();
  const correct = trpc.forms.correct.useMutation();

  const permissions = access.data?.permissions ?? [];
  const privileged = Boolean(access.data?.isSuperAdministrator || permissions.includes("*"));
  const canFill = privileged || permissions.includes("forms.fill");
  const canCorrect = privileged || permissions.includes("forms.responses.correct");
  const bindings = (query.data?.bindings ?? []) as HydratedBinding[];
  const submissions = ((query.data?.submissions ?? []) as OperationalSubmission[]).map(submission => ({ ...submission, revision: Number(submission.revision ?? 1) }));
  const items = useMemo(() => deriveIncidentFormItems(bindings, submissions.map(submission => ({ ...submission, revision: Number(submission.revision ?? 1) }))), [bindings, submissions]);
  const currentItem = selected ? items.find(item => item.id === selected.id) ?? selected : null;
  const currentBinding = currentItem ? bindings.find(binding => binding.id === currentItem.id) ?? null : null;
  const currentSubmission = currentItem ? activeSubmissionFor(currentItem, submissions) : null;

  async function refresh() {
    await query.refetch();
  }

  if (!validIncident) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex max-h-[calc(100vh-2rem)] w-[min(460px,calc(100vw-2rem))] flex-col items-end gap-2">
      {open && (
        <div className="max-h-[calc(100vh-5rem)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-2xl shadow-slate-950/20">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-sky-700">D-008</p><h2 className="font-semibold text-slate-950">Formulários da ocorrência</h2></div>
            <button type="button" onClick={() => { setOpen(false); setSelected(null); }} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">Fechar</button>
          </div>

          {query.isLoading && <p className="rounded-lg bg-white p-4 text-sm text-slate-500">Carregando formulários...</p>}
          {query.error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{query.error.message}</p>}

          {!query.isLoading && !query.error && !currentItem && (
            <IncidentFormsPanel bindings={bindings} submissions={submissions.map(submission => ({ ...submission, revision: Number(submission.revision ?? 1) }))} onOpen={setSelected} />
          )}

          {currentItem && currentBinding && (
            <IncidentFormWorkspace
              incidentId={String(incidentId)}
              formId={currentBinding.formId}
              formVersionId={currentBinding.formVersionId}
              formName={currentBinding.name?.trim() || `Formulário #${currentBinding.formId}`}
              definition={currentBinding.definition}
              state={currentItem.state}
              submissionId={currentSubmission?.id}
              initialAnswers={currentSubmission?.answers ?? {}}
              canFill={canFill}
              canCorrect={canCorrect}
              onClose={() => setSelected(null)}
              onStart={async input => { const result = await start.mutateAsync(input); await refresh(); return result; }}
              onSubmit={async input => { const result = await submit.mutateAsync(input); await refresh(); return result; }}
              onCorrect={async input => { const result = await correct.mutateAsync(input); await refresh(); return result; }}
            />
          )}
        </div>
      )}

      <button type="button" onClick={() => setOpen(value => !value)} className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/25" aria-expanded={open} aria-label="Abrir formulários operacionais">
        Formulários operacionais
      </button>
    </div>
  );
}

export default IncidentFormsOperationalDock;
