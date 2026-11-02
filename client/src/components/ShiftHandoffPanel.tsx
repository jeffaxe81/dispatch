import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function ShiftHandoffPanel() {
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const utils = trpc.useUtils();
  const current = trpc.workShifts.current.useQuery(undefined, { retry: false });
  const candidates = trpc.workShifts.handoffCandidates.useQuery(undefined, { retry: false });
  const pending = trpc.workShifts.pendingHandoffs.useQuery(undefined, { retry: false });
  const request = trpc.workShifts.requestHandoff.useMutation({
    onSuccess: result => {
      setNote("");
      setRecipient("");
      setMessage("Passagem registrada #" + result.requestId + ". Aguarda confirmação do destinatário.");
    },
  });
  const confirm = trpc.workShifts.confirmHandoff.useMutation({
    onSuccess: async () => { setMessage("Passagem confirmada e auditada."); await utils.workShifts.pendingHandoffs.invalidate(); },
  });
  return <section aria-label="Passagem de plantão" className="rounded-xl border border-sky-200 bg-white p-4">
    <h2 className="font-semibold text-slate-900">Passagem de plantão</h2>
    <p className="mt-1 text-xs text-slate-600">Solicitação e confirmação auditadas por usuário e horário. Não altera automaticamente a escala nem a jornada.</p>
    {current.isLoading && <p className="mt-2 text-sm">Verificando sua jornada...</p>}
    {!current.isLoading && !current.data && <p className="mt-2 text-sm text-amber-700">Inicie sua jornada antes de solicitar uma passagem.</p>}
    {current.data && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(160px,1fr)_2fr_auto] sm:items-end">
      <label className="text-xs font-medium text-slate-700">Responsável de destino
        <select aria-label="Responsável pela passagem de plantão" className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm" value={recipient} onChange={e => setRecipient(e.target.value)}>
          <option value="">Selecione</option>
          {(candidates.data ?? []).map(person => <option key={person.id} value={person.id}>{person.name ?? "Usuário"} #{person.id}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-700">Registro operacional
        <textarea aria-label="Motivo da passagem de plantão" rows={2} maxLength={1000}
          className="mt-1 w-full rounded border border-slate-300 p-2 text-sm" value={note} onChange={e => setNote(e.target.value)}/>
      </label>
      <button type="button" className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        disabled={!recipient || note.trim().length < 10 || request.isPending}
        onClick={() => request.mutate({ recipientUserId: Number(recipient), note: note.trim() })}>
        Solicitar passagem
      </button>
    </div>}
    {(pending.data ?? []).length > 0 && <div className="mt-3 space-y-2">
      <h3 className="text-sm font-medium text-slate-800">Passagens aguardando sua confirmação</h3>
      {(pending.data ?? []).map(row => <div key={row.requestId} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2 text-sm">
        <div>Solicitação #{row.requestId}, usuário #{row.senderUserId ?? "—"} · {new Date(row.occurredAt).toLocaleString("pt-BR")}
          <p className="text-xs text-slate-600">{row.note}</p>
        </div>
        <button type="button" disabled={confirm.isPending} onClick={() => confirm.mutate({requestId: row.requestId})}
          className="rounded border border-sky-700 px-3 py-2 text-xs text-sky-800 disabled:opacity-50">Confirmar</button>
      </div>)}
    </div>}
    {message && <p role="status" className="mt-2 text-sm text-sky-800">{message}</p>}
    {(request.error || confirm.error) && <p role="alert" className="mt-2 text-sm text-rose-700">{request.error?.message ?? confirm.error?.message}</p>}
  </section>;
}
