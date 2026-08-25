import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/operational";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, DatabaseZap, Eye, Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

const resourceLabels: Record<string, string> = {
  incident: "Ocorrência",
  assignment: "Despacho",
  user: "Usuário",
  user_role_assignment: "Vínculo de perfil",
  access_role: "Perfil",
  access_permission: "Permissão",
  role_permission: "Permissão de perfil",
  organization: "Organização",
  organizational_unit: "Unidade organizacional",
  team: "Equipe",
  vehicle: "Viatura",
  team_shift: "Jornada de equipe",
  team_location: "Localização de equipe",
  general_settings: "Configurações gerais",
  solution_reset: "Reinicialização controlada",
  workflow: "Workflow",
  workflow_execution: "Execução de workflow",
  integration_connection: "Conexão de integração",
  integration_credential: "Credencial de integração",
  integration_webhook: "Webhook de integração",
  integration_log: "Log de integração",
  alrt_incoming_event: "Evento recebido do ALRT",
  help_favorite: "Favorito de ajuda",
  faq_suggestion: "Sugestão de FAQ",
  dashboard_saved_filter: "Filtro salvo do dashboard",
  incident_evidence: "Evidência de ocorrência",
};

export function getOperationLabel(action: string) {
  const labels: Record<string, string> = {
    create: "Criação",
    update: "Edição",
    access_profile_updated: "Perfil de acesso atualizado",
    status_transition: "Alteração de situação",
    team_assigned: "Equipe designada",
    assignment_accepted: "Despacho aceito",
    assignment_declined: "Despacho recusado",
    permanent_delete: "Exclusão permanente",
    operational_data_reset: "Dados operacionais reinicializados",
    map_configuration_updated: "Mapa configurado",
    shift_started: "Jornada iniciada",
    shift_paused: "Jornada pausada",
    shift_resumed: "Jornada retomada",
    shift_ended: "Jornada encerrada",
    location_recorded: "Localização registrada",
    status_updated: "Status atualizado",
    update_versioned: "Nova versão salva",
    publish_activate: "Workflow publicado",
    deactivate: "Workflow desativado",
    "workflow_execution.queue": "Execução de workflow enfileirada",
    "workflow_execution.complete": "Execução de workflow concluída",
    "workflow_execution.fail": "Execução de workflow com falha",
    "workflow_execution.dead_letter": "Execução enviada para dead-letter",
    "workflow_execution.retry": "Execução de workflow reprocessada",
    create_homologation_reference: "Referência de homologação criada",
    create_simulation: "Conexão de simulação criada",
    create_placeholder: "Placeholder de credencial criado",
    delete_placeholder: "Placeholder de credencial removido",
    manual_preprovision: "Usuário pré-cadastrado manualmente",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

type OperationAudit = {
  id: number;
  action: string;
  resourceType: string;
  resourceId: number;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: Date;
};

export function getOperationAuditDetails(audit: OperationAudit) {
  const before = audit.beforeData ?? {};
  const after = audit.afterData ?? {};
  if (audit.action === "permanent_delete") {
    const incident = (before.incident ?? {}) as Record<string, unknown>;
    const assignments = Array.isArray(before.assignments) ? before.assignments : [];
    return {
      title: "Evidência preservada da exclusão",
      summary: `Ocorrência ${String(incident.code ?? audit.resourceId)} removida permanentemente com ${assignments.length} despacho(s) associado(s).`,
      deletionReason: String(before.deletionReason ?? "Não informado"),
      incidentCode: String(incident.code ?? "—"),
      eventCount: Number(before.eventCount ?? 0),
      reset: null,
      before,
      after,
    };
  }
  if (audit.action === "operational_data_reset") {
    const impact = (before.impact ?? {}) as Record<string, unknown>;
    const preserved = Array.isArray(before.preserved) ? before.preserved.map(String) : [];
    return {
      title: "Evidência preservada da reinicialização",
      summary: `${Number(before.totalRecords ?? 0)} registro(s) operacionais e de simulação foram removidos por uma reinicialização controlada.`,
      deletionReason: null,
      incidentCode: null,
      eventCount: null,
      reset: {
        reason: String(before.reason ?? "Não informado"),
        totalRecords: Number(before.totalRecords ?? 0),
        scope: String(before.resetScope ?? "operational_and_simulation_data"),
        preserved,
        impact,
        completedAt: String(after.completedAt ?? "—"),
      },
      before,
      after,
    };
  }
  return { title: "Evidência da operação", summary: "Valores registrados antes e depois da ação auditada.", deletionReason: null, incidentCode: null, eventCount: null, reset: null, before, after };
}

function OperationsLogContent() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [resourceType, setResourceType] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedAudit, setSelectedAudit] = useState<OperationAudit | null>(null);
  const normalizedSearch = search.trim();
  const query = trpc.audit.operations.useQuery({ page, pageSize, resourceType: resourceType === "all" ? undefined : resourceType, search: normalizedSearch || undefined });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize));
  const firstVisible = (query.data?.total ?? 0) ? (page - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(page * pageSize, query.data?.total ?? 0);
  const evidence = selectedAudit ? getOperationAuditDetails(selectedAudit) : null;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-8">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Governança</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Log de operações</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Consulta imutável das ações auditadas. Exclusões e reinicializações preservam a prévia de impacto e o motivo informado.</p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_190px_130px] md:w-auto md:min-w-[640px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="pl-9 pr-9" placeholder="Buscar ação, recurso ou responsável" aria-label="Buscar no histórico" />{search && <button type="button" onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Limpar busca"><X className="h-4 w-4" /></button>}</div><Select value={resourceType} onValueChange={value => { setResourceType(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Tipo de recurso" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os recursos</SelectItem>{Object.entries(resourceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25 por página</SelectItem><SelectItem value="50">50 por página</SelectItem><SelectItem value="100">100 por página</SelectItem></SelectContent></Select></div>
      </header>
      <QueryState loading={query.isLoading} error={query.error} label="log de operações" />
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 text-sm text-slate-500"><span>{query.data?.total ?? 0} operação(ões) registrada(s) · mostrando {firstVisible}–{lastVisible}</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" />Auditável e imutável</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[.1em] text-slate-500"><tr><th className="px-5 py-3 font-medium">Operação</th><th className="px-4 py-3 font-medium">Recurso</th><th className="px-4 py-3 font-medium">Responsável</th><th className="px-4 py-3 font-medium">Data e hora</th><th className="px-4 py-3 font-medium">Evidência</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(query.data?.rows ?? []).map(({ audit, actorName, actorEmail }) => {
                  const destructive = audit.action === "permanent_delete" || audit.action === "operational_data_reset";
                  const reset = audit.action === "operational_data_reset";
                  return <tr key={audit.id} className={destructive ? "bg-rose-50/40" : ""}><td className="px-5 py-4"><div className="flex items-center gap-2">{destructive && (reset ? <DatabaseZap className="h-4 w-4 text-rose-700" /> : <AlertTriangle className="h-4 w-4 text-rose-700" />)}<div><p className={`font-medium ${destructive ? "text-rose-800" : "text-slate-900"}`}>{getOperationLabel(audit.action)}</p>{destructive && <p className="mt-1 text-xs text-rose-700">{reset ? "Dados previstos removidos; evidência e motivo preservados." : "Registro excluído permanentemente; evidência preservada."}</p>}</div></div></td><td className="px-4 py-4"><Badge variant="outline">{resourceLabels[audit.resourceType] ?? audit.resourceType}</Badge><p className="mt-1 text-xs text-slate-500">ID {audit.resourceId}</p></td><td className="px-4 py-4 text-sm text-slate-700">{actorName ?? actorEmail ?? "Sistema"}</td><td className="px-4 py-4 text-sm text-slate-500">{formatDateTime(audit.createdAt)}</td><td className="px-4 py-4"><Button variant="outline" size="sm" onClick={() => setSelectedAudit(audit)}><Eye className="mr-1.5 h-3.5 w-3.5" />Ver detalhes</Button></td></tr>;
                })}
                {!query.isLoading && (query.data?.rows.length ?? 0) === 0 && <tr><td colSpan={5} className="px-5 py-16 text-center text-sm text-slate-500"><ClipboardList className="mx-auto mb-3 h-7 w-7 text-slate-300" />Nenhum registro corresponde ao filtro atual.</td></tr>}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><span className="text-sm text-slate-500">Página {page} de {totalPages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button></div></footer>
        </CardContent>
      </Card>
      <Dialog open={Boolean(selectedAudit)} onOpenChange={open => !open && setSelectedAudit(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{evidence?.title}</DialogTitle><DialogDescription>{evidence?.summary}</DialogDescription></DialogHeader>
          {evidence && <div className="space-y-4 py-2">
            {evidence.deletionReason && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-rose-700">Motivo da exclusão</p><p className="mt-2 text-sm leading-6 text-rose-950">{evidence.deletionReason}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge variant="outline" className="border-rose-200 bg-white text-rose-800">Ocorrência {evidence.incidentCode}</Badge><Badge variant="outline" className="border-rose-200 bg-white text-rose-800">{evidence.eventCount} evento(s) preservado(s)</Badge></div></div>}
            {evidence.reset && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-rose-700">Reinicialização controlada</p><p className="mt-2 text-sm leading-6 text-rose-950">{evidence.reset.reason}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><Badge variant="outline" className="border-rose-200 bg-white text-rose-800">{evidence.reset.scope === "total_solution_data" ? "Escopo total" : "Escopo operacional"}</Badge><Badge variant="outline" className="border-rose-200 bg-white text-rose-800">{evidence.reset.totalRecords} registro(s) removido(s)</Badge><Badge variant="outline" className="border-rose-200 bg-white text-rose-800">Concluída em {evidence.reset.completedAt}</Badge></div><p className="mt-3 text-xs leading-5 text-rose-900">Preservados: {evidence.reset.preserved.join(", ") || "não informado"}.</p><pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-rose-950 p-3 text-xs leading-5 text-rose-50">{JSON.stringify(evidence.reset.impact, null, 2)}</pre></div>}
            <div className="grid gap-4 md:grid-cols-2"><section><h3 className="mb-2 text-sm font-semibold text-slate-900">Dados anteriores</h3><pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">{JSON.stringify(evidence.before, null, 2)}</pre></section><section><h3 className="mb-2 text-sm font-semibold text-slate-900">Dados posteriores</h3><pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">{JSON.stringify(evidence.after, null, 2)}</pre></section></div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OperationsLogPage() {
  return <DashboardLayout><OperationsLogContent /></DashboardLayout>;
}
