import React, { useState } from "react";
import type { FormAnswers, FormSchemaDefinition } from "@shared/forms";
import { FormRenderer } from "./FormRenderer";
import type { IncidentFormState } from "./IncidentFormsPanel";

type StartInput = { formId: number; formVersionId: number; contextType: "incident"; contextId: string };
type SubmitInput = StartInput & { submissionId?: number; answers: FormAnswers };
type CorrectInput = { submissionId: number; answers: FormAnswers; reason: string };

export type IncidentFormWorkspaceProps = {
  incidentId: string;
  formId: number;
  formVersionId: number;
  formName: string;
  definition: FormSchemaDefinition;
  state: IncidentFormState;
  submissionId?: number;
  initialAnswers?: FormAnswers;
  canFill?: boolean;
  canCorrect?: boolean;
  onStart(input: StartInput): Promise<unknown>;
  onSubmit(input: SubmitInput): Promise<unknown>;
  onCorrect(input: CorrectInput): Promise<unknown>;
  onClose?: () => void;
};

const labels: Record<IncidentFormState, string> = {
  not_started: "Não iniciado",
  in_progress: "Em preenchimento",
  submitted: "Enviado",
  corrected: "Corrigido",
};

function message(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação do formulário.";
}

function resultSubmissionId(result: unknown) {
  if (!result || typeof result !== "object" || !("submissionId" in result)) return null;
  const id = Number((result as { submissionId?: unknown }).submissionId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function IncidentFormWorkspace(props: IncidentFormWorkspaceProps) {
  const [state, setState] = useState<IncidentFormState>(props.state);
  const [submissionId, setSubmissionId] = useState<number | null>(props.submissionId ?? null);
  const [answers, setAnswers] = useState<FormAnswers>({ ...(props.initialAnswers ?? {}) });
  const [correctionMode, setCorrectionMode] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canFill = props.canFill ?? true;
  const canCorrect = props.canCorrect ?? true;

  const editable = (canFill && state === "in_progress") || (canCorrect && correctionMode);
  const operationalContext = { formId: props.formId, formVersionId: props.formVersionId, contextType: "incident" as const, contextId: props.incidentId };

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => {
    if (!canFill) throw new Error("Seu perfil não possui permissão para preencher formulários.");
    const result = await props.onStart(operationalContext);
    const startedId = resultSubmissionId(result);
    if (!startedId) throw new Error("O início do formulário não retornou uma submissão válida.");
    setSubmissionId(startedId);
    setState("in_progress");
  });

  const submit = () => run(async () => {
    if (!canFill) throw new Error("Seu perfil não possui permissão para preencher formulários.");
    const result = await props.onSubmit({ ...operationalContext, ...(submissionId ? { submissionId } : {}), answers });
    const submittedId = resultSubmissionId(result);
    if (submittedId) setSubmissionId(submittedId);
    setState("submitted");
  });

  const correct = () => {
    if (!canCorrect) {
      setError("Seu perfil não possui permissão para corrigir respostas.");
      return;
    }
    if (!submissionId) {
      setError("Submissão original não encontrada para correção.");
      return;
    }
    if (!reason.trim()) {
      setError("Informe o motivo da correção.");
      return;
    }
    void run(async () => {
      await props.onCorrect({ submissionId, answers, reason: reason.trim() });
      setState("corrected");
      setCorrectionMode(false);
      setReason("");
    });
  };

  return (
    <section aria-label={`Preenchimento do formulário ${props.formName}`} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950">{props.formName}</h2>
          <p className="mt-1 text-sm text-slate-500">Versão vinculada #{props.formVersionId} · {labels[state]}</p>
        </div>
        {props.onClose && <button type="button" onClick={props.onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Fechar</button>}
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">O envio ou a correção deste formulário não altera automaticamente o status da ocorrência.</div>
      {error && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-4">
        <FormRenderer definition={props.definition} values={answers} readOnly={!editable || busy} onChange={(key, value) => setAnswers(current => ({ ...current, [key]: value }))} />
      </div>

      {canCorrect && correctionMode && (
        <div className="mt-4">
          <label htmlFor="form-correction-reason" className="block text-sm font-medium text-slate-700">Motivo da correção</label>
          <textarea id="form-correction-reason" value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-md border border-slate-300 p-2" />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canFill && state === "not_started" && <button type="button" disabled={busy} onClick={() => void start()} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Iniciar preenchimento</button>}
        {canFill && state === "in_progress" && <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Enviar formulário</button>}
        {canCorrect && (state === "submitted" || state === "corrected") && !correctionMode && <button type="button" disabled={busy || !submissionId} onClick={() => setCorrectionMode(true)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Corrigir resposta</button>}
        {canCorrect && correctionMode && <>
          <button type="button" disabled={busy} onClick={correct} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Salvar correção</button>
          <button type="button" disabled={busy} onClick={() => { setCorrectionMode(false); setReason(""); setError(null); }} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancelar correção</button>
        </>}
      </div>
    </section>
  );
}

export default IncidentFormWorkspace;
