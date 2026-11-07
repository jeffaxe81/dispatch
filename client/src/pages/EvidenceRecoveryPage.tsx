import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, Clock3,
  FileWarning, LockKeyhole, RefreshCw, ShieldCheck,
} from "lucide-react";
import { useState } from "react";

type RecoveryFilter = "all" | "cleanup_required" | "stale_reserved" | "missing_reference";
type RecoveryReason = "cleanup_pending_review" | "stale_upload_reservation" | "missing_evidence_reference";

const filterLabels: Record<RecoveryFilter, string> = {
  all: "Todas as pendências",
  cleanup_required: "Limpeza sob revisão",
  stale_reserved: "Reservas antigas",
  missing_reference: "Referências ausentes",
};

const reasons: Record<RecoveryReason, {
  title: string;
  detail: string;
  className: string;
}> = {
  cleanup_pending_review: {
    title: "Verificar arquivo",
    detail: "A operação falhou ou a ocorrência foi removida. O arquivo pode existir no storage.",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  stale_upload_reservation: {
    title: "Reserva antiga",
    detail: "O envio começou há mais de 15 minutos e não tem confirmação.",
    className: "border-sky-200 bg-sky-50 text-sky-900",
  },
  missing_evidence_reference: {
    title: "Referência ausente",
    detail: "O upload foi marcado como concluído, mas o registro da evidência não foi encontrado.",
    className: "border-rose-200 bg-rose-50 text-rose-900",
  },
};

export function formatRecoveryDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function EvidenceRecoveryContent() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [state, setState] = useState<RecoveryFilter>("all");
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const authorized = access.data?.isSuperAdministrator === true;
  const query = trpc.settings.evidenceRecovery.useQuery(
    { page, pageSize, state },
    { enabled: authorized, retry: false, refetchOnWindowFocus: false },
  );
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);

  if (access.isLoading) return <QueryState loading label="autorização de acesso" />;
  if (access.error) return <QueryState error={access.error} label="autorização de acesso" />;
  if (!authorized) {
    return <div role="alert" className="mx-auto max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
      <LockKeyhole className="mb-3 h-6 w-6" />
      <h1 className="text-lg font-semibold">Acesso restrito</h1>
      <p className="mt-2 text-sm">A conciliação de evidências está disponível somente para o Super Administrador.</p>
    </div>;
  }

  return <main className="mx-auto max-w-6xl space-y-5 pb-10">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Administração superior / Integridade</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Conciliação de evidências</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Acompanhe arquivos que precisam de verificação após uploads interrompidos,
          alterações de sessão ou exclusão de ocorrências.
        </p>
      </div>
      <Badge className="w-fit border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">
        <ShieldCheck className="mr-1.5 h-4 w-4" />Somente leitura
      </Badge>
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-700"><FileWarning className="h-5 w-5" /></div>
          <div><p className="text-xs text-slate-500">Pendências no filtro</p><p className="text-2xl font-semibold tabular-nums text-slate-950">{query.data?.total ?? "—"}</p></div>
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-sky-50 p-3 text-sky-700"><Clock3 className="h-5 w-5" /></div>
          <div><p className="text-xs text-slate-500">Reserva considerada antiga</p><p className="text-xl font-semibold text-slate-950">{query.data?.staleAfterMinutes ?? 15} minutos</p></div>
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><LockKeyhole className="h-5 w-5" /></div>
          <div><p className="text-xs text-slate-500">Ação disponível</p><p className="text-sm font-semibold text-slate-950">Consulta e investigação</p><p className="text-xs text-slate-500">Exclusão desabilitada</p></div>
        </CardContent>
      </Card>
    </div>

    <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Uma pendência não comprova que o arquivo existe no provedor. Antes de qualquer limpeza física, é necessária conferência técnica e autorização. Nenhuma exclusão é realizada nesta tela.</span>
    </div>

    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-sky-700" />Fila de revisão</CardTitle>
            <CardDescription className="mt-1">Lista paginada de tentativas que exigem análise. Os identificadores privados do storage não são exibidos.</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-[175px] flex-1 gap-1.5 md:flex-none">
              <Label htmlFor="evidence-recovery-filter">Situação</Label>
              <Select value={state} onValueChange={value => { setState(value as RecoveryFilter); setPage(1); }}>
                <SelectTrigger id="evidence-recovery-filter" aria-label="Filtrar situação" className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(filterLabels).map(([key, title]) => <SelectItem key={key} value={key}>{title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-[115px] gap-1.5">
              <Label htmlFor="evidence-recovery-page-size">Por página</Label>
              <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(1); }}>
                <SelectTrigger id="evidence-recovery-page-size" aria-label="Resultados por página" className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size} itens</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" aria-label="Atualizar fila" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>
              <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Atualizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span aria-live="polite">{total} pendência(s) · exibindo {first}–{last}</span>
          <span>Dados administrativos restritos</span>
        </div>
        <div className="p-4 sm:p-5">
          <QueryState loading={query.isLoading} error={query.error} label="fila de conciliação" />
          {!query.isLoading && !query.error && (query.data?.rows.length ?? 0) === 0 && (
            <div role="status" className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center">
              <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-emerald-600" />
              <h2 className="font-medium text-slate-900">Nenhuma pendência neste filtro</h2>
              <p className="mt-1 text-sm text-slate-500">A consulta não encontrou itens que precisem de investigação.</p>
            </div>
          )}
          {!query.error && (
            <div role="list" aria-label="Tentativas de conciliação" className="space-y-3">
              {(query.data?.rows ?? []).map(item => {
                const reason = item.reason ? reasons[item.reason] : null;
                return <article role="listitem" key={item.attemptId} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Tentativa</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-800">{item.attemptId}</p>
                    </div>
                    {reason && <Badge variant="outline" className={`w-fit shrink-0 ${reason.className}`}>{reason.title}</Badge>}
                  </div>
                  {reason && <p className="mt-3 text-sm leading-5 text-slate-600">{reason.detail}</p>}
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
                    <div><dt className="text-xs text-slate-500">Ocorrência</dt><dd className="mt-1 font-medium text-slate-900">#{item.incidentId}{!item.incidentExists ? <span className="ml-1 text-xs text-amber-700">(removida)</span> : ""}</dd></div>
                    <div><dt className="text-xs text-slate-500">Responsável / equipe</dt><dd className="mt-1 font-medium text-slate-900">#{item.actorUserId} · #{item.teamId}</dd></div>
                    <div><dt className="text-xs text-slate-500">Referência no banco</dt><dd className="mt-1 font-medium text-slate-900">{item.hasEvidenceReference ? "Existente" : "Ausente"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Última atualização</dt><dd className="mt-1 font-medium text-slate-900">{formatRecoveryDate(item.updatedAt)}</dd></div>
                  </dl>
                </article>;
              })}
            </div>
          )}
        </div>
      </CardContent>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <p className="text-sm text-slate-600">Página {page} de {totalPages}</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(current => Math.max(1, current - 1))}>
            <ChevronLeft className="mr-1 h-4 w-4" />Anterior
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={page >= totalPages || query.isFetching} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>
            Próxima<ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </footer>
    </Card>
  </main>;
}

export default function EvidenceRecoveryPage() {
  return <DashboardLayout><EvidenceRecoveryContent /></DashboardLayout>;
}
