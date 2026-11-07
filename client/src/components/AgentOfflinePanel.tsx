import React, { useEffect, useState } from "react";
import {
  loadAgentNoteDraft, loadAuthorizedAssignmentSnapshot,
  saveAgentNoteDraft, saveLastAuthorizedAssignments,
  agentOfflineKey, type AgentOfflineAssignment, type AgentOfflineScope,
} from "@/lib/agentOffline";
import { Button } from "@/components/ui/button";
import { compareAgentOfflineAssignments, type AgentAssignmentReconciliation } from "@/lib/agentOfflineReconcile";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  scope: AgentOfflineScope;
  assignments: AgentOfflineAssignment[];
  canSave: boolean;
  canReconcile: boolean;
  onLoadFreshAssignments: () => Promise<AgentOfflineAssignment[]>;
  activeIncidentId?: number;
  note: string;
  onRestoreNote: (text: string) => void;
};
/**
 * F041/F042/F045: expiring sessionStorage with optional redacted localStorage snapshot;
 * no automatic mutations or persistent note drafts.
 * A snapshot is NOT authority to operate on an incident when offline.
 */
export function AgentOfflinePanel({ scope, assignments, canSave, canReconcile, onLoadFreshAssignments, activeIncidentId, note, onRestoreNote }: Props) {
  const [snapshot, setSnapshot] = useState<{ rows: AgentOfflineAssignment[]; expiresAt: number } | null>(null);
  // Default to tab-only storage; persisting the redacted summary requires an explicit opt-in.
  const [persistOnDevice, setPersistOnDevice] = useState(false);
  useEffect(() => {
    if (!snapshot) return;
    const handle = window.setTimeout(() => setSnapshot(null), Math.max(0, snapshot.expiresAt - Date.now()));
    return () => window.clearTimeout(handle);
  }, [snapshot?.expiresAt]);
  const [message, setMessage] = useState("");
  const [reconciliation, setReconciliation] = useState<AgentAssignmentReconciliation | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { if (!canReconcile) setReconciliation(null); }, [canReconcile]);
  const summaryStorage = () => persistOnDevice ? window.localStorage : window.sessionStorage;
  const changeStorage = (persist: boolean) => {
    // Opting out revokes any previous on-device copy immediately.
    if (!persist) {
      try { window.localStorage.removeItem(agentOfflineKey(scope, "list")); } catch { /* best effort; delete button remains available */ }
    }
    setPersistOnDevice(persist);
    setSnapshot(null);
    setReconciliation(null);
    setMessage("");
  };
  const deleteDeviceCopy = () => {
    try {
      window.localStorage.removeItem(agentOfflineKey(scope, "list"));
      setSnapshot(null);
      setReconciliation(null);
      setMessage("Cópia persistida removida deste dispositivo.");
    } catch {
      setMessage("Não foi possível remover a cópia deste dispositivo.");
    }
  };
  const saveList = () => {
    try {
      saveLastAuthorizedAssignments(summaryStorage(), scope, assignments);
      setSnapshot(null);
      setMessage(persistOnDevice ? "Resumo mínimo guardado no dispositivo por até 15 minutos. Não substitui autenticação." : "Resumo guardado nesta aba por até 15 minutos. Sem endereço ou descrição.");
    } catch {
      setMessage("Não foi possível guardar o resumo local. Confira a sessão e o armazenamento.");
    }
  };
  const openList = () => {
    try {
      const saved = loadAuthorizedAssignmentSnapshot(summaryStorage(), scope);
      setSnapshot(saved);
      setMessage(saved?.rows.length ? "Cópia temporária para consulta, não autoriza operações offline." : "Sem cópia válida ou prazo de 15 minutos expirado.");
    } catch {
      setSnapshot(null);
      setMessage("Não foi possível ler o resumo local.");
    }
  };
  const compareWithServer = async () => {
    if (!canReconcile || checking) return;
    setChecking(true);
    setReconciliation(null);
    setMessage("");
    try {
      const previous = loadAuthorizedAssignmentSnapshot(summaryStorage(), scope);
      if (!previous) {
        setMessage("Não há resumo offline válido para comparar. O resumo pode ter expirado.");
        return;
      }
      const fresh = await onLoadFreshAssignments();
      const result = compareAgentOfflineAssignments(previous.rows, fresh);
      setReconciliation(result);
      setMessage("Conferência manual concluída com consulta atualizada. Revise as diferenças antes de operar.");
    } catch {
      setReconciliation(null);
      setMessage("Não foi possível confirmar os dados atuais no servidor. Nenhuma ação foi executada.");
    } finally {
      setChecking(false);
    }
  };
  const saveDraft = () => {
    if (!activeIncidentId) return;
    try {
      saveAgentNoteDraft(window.sessionStorage, scope, activeIncidentId, note);
      setMessage("Rascunho salvo somente nesta sessão. Não foi enviado.");
    } catch {
      setMessage("O rascunho exige 3 a 1000 caracteres e armazenamento disponível.");
    }
  };
  const restoreDraft = () => {
    if (!activeIncidentId) return;
    try {
      const value = loadAgentNoteDraft(window.sessionStorage, scope, activeIncidentId);
      if (value === null) {
        setMessage("Rascunho indisponível ou expirado.");
      } else {
        onRestoreNote(value);
        setMessage("Rascunho restaurado na tela. Confira e confirme a ação operacional separadamente.");
      }
    } catch {
      setMessage("Não foi possível restaurar o rascunho.");
    }
  };
  return <Card className="border-sky-200 bg-sky-50/40">
    <CardContent className="space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Consulta temporária de campo</h2>
        <p className="mt-1 text-xs text-slate-600">Resumo mínimo expira após 15 minutos e é isolado por usuário, organização e equipe. Não contém endereço, coordenadas ou anexos.</p>
        <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-800">
          <input type="checkbox" className="h-4 w-4" checked={persistOnDevice} onChange={event => changeStorage(event.target.checked)} />
          Manter resumo no dispositivo após fechar a aba
        </label>
        <p className="mt-1 text-xs text-slate-500">Ao reabrir, marque a opção novamente e consulte o resumo manualmente após autenticação. Rascunhos de notas continuam só nesta aba.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={saveList} disabled={!canSave}>Guardar resumo autorizado</Button>
        <Button type="button" size="sm" variant="outline" onClick={openList}>Consultar resumo temporário</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void compareWithServer()} disabled={!canReconcile || checking}>{checking ? "Conferindo..." : "Comparar resumo com servidor"}</Button>
        {persistOnDevice && <Button type="button" size="sm" variant="outline" onClick={deleteDeviceCopy}>Apagar cópia deste dispositivo</Button>}
        {activeIncidentId ? <>
          <Button type="button" size="sm" variant="outline" onClick={saveDraft} disabled={note.trim().length < 3 || note.length > 1000}>Guardar rascunho</Button>
          <Button type="button" size="sm" variant="outline" onClick={restoreDraft}>Restaurar rascunho</Button>
        </> : null}
      </div>
      {message && <p role="status" className="text-xs text-sky-800">{message}</p>}
      {reconciliation && <section aria-label="Diferenças do resumo offline" className="rounded-lg border border-sky-200 bg-white p-3 text-xs text-slate-700">
        <p className="font-semibold">Comparação: {reconciliation.changed} status alterado(s), {reconciliation.added} nova(s) atribuição(ões), {reconciliation.removed} removida(s), {reconciliation.unchanged} inalterada(s).</p>
        <p className="mt-1">Conferência somente leitura. Nenhuma operação pendente será enviada; o servidor continuará validando a atribuição e a revisão.</p>
        {reconciliation.differences.map(change => <p key={change.id} className="mt-2">
          <strong>{change.code}</strong> — {change.kind === "changed" ? `status: ${change.previousStatus} → ${change.currentStatus}` : change.kind === "added" ? "nova atribuição no servidor" : "não aparece mais nas atribuições atuais"}
        </p>)}
      </section>}
      {snapshot && Date.now() < snapshot.expiresAt && <div className="space-y-1" aria-label="Resumo temporário autorizado">
        {snapshot.rows.map(item => <p key={item.id} className="text-xs text-slate-700">{item.code} — {item.category} — {item.status}</p>)}
        {!snapshot.rows.length && <p className="text-xs text-slate-500">Nenhuma ocorrência armazenada ou cache expirado.</p>}
      </div>}
    </CardContent>
  </Card>;
}
