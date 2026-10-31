import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { RefreshControls } from "@/components/RefreshControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { priorityClasses, priorityLabels, statusLabels } from "@/lib/operational";
import { formatIncidentAge, prepareKanbanRows, type KanbanSortOrder } from "@/lib/kanbanQueue";
import { trpc } from "@/lib/trpc";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const boardColumns = ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada", "concluida"] as const;
type BoardStatus = (typeof boardColumns)[number];
const allowed: Record<string, string[]> = {
  triagem: ["aguardando_despacho", "cancelada"],
  aguardando_despacho: ["despachada", "cancelada"],
  despachada: ["aceita", "aguardando_despacho", "cancelada"],
  aceita: ["em_atendimento", "aguardando_despacho", "cancelada"],
  em_atendimento: ["pausada", "concluida", "cancelada"],
  pausada: ["em_atendimento", "cancelada"],
  concluida: [],
  cancelada: [],
};

function KanbanContent() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [priority, setPriority] = useState<"todas" | "baixa" | "media" | "alta" | "critica">("todas");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<KanbanSortOrder>("priority");
  const [teamFilter, setTeamFilter] = useState("todas");
  const [openedFrom, setOpenedFrom] = useState("");
  const [openedThrough, setOpenedThrough] = useState("");
  const [page, setPage] = useState(1);
  const utils = trpc.useUtils();
  const refresh = useRefreshSettings();
  const pageSize = 100;
  const teams = trpc.teams.list.useQuery(undefined, { retry: false });
  const openedBefore = openedThrough ? new Date(Date.parse(openedThrough + "T00:00:00.000Z") + 86_400_000) : undefined;
  const dateRangeInvalid = Boolean(openedFrom && openedThrough && openedFrom > openedThrough);
  const list = trpc.incidents.list.useQuery({
    page, pageSize,
    priority: priority === "todas" ? undefined : priority,
    search: search.trim() || undefined,
    teamId: teamFilter === "todas" ? undefined : Number(teamFilter),
    openedFrom: openedFrom ? new Date(openedFrom + "T00:00:00.000Z") : undefined,
    openedBefore,
  }, { refetchInterval: refresh.interval || false, enabled: !dateRangeInvalid });
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));
  const visibleRows = prepareKanbanRows(list.data?.rows ?? [], { priority, query: search, sort: sortOrder });
  const asOf = new Date();
  const transition = trpc.incidents.transition.useMutation({
    onSuccess: () => { utils.incidents.list.invalidate(); utils.dashboard.summary.invalidate(); setError(""); },
    onError: mutationError => setError(mutationError.message),
  });
  const allowedRole = ["despachador", "supervisor", "administrador"].includes(user?.operationalRole ?? "");
  const move = (incidentId: number, currentStatus: string, nextStatus: string, source: "kanban" | "selector") => {
    if (!allowed[currentStatus]?.includes(nextStatus)) {
      setError("Essa mudança não é permitida pelo ciclo de vida da ocorrência.");
      return;
    }
    transition.mutate({ incidentId, nextStatus: nextStatus as BoardStatus, note: source === "kanban" ? "Situação atualizada pelo quadro Kanban." : "Situação atualizada pelo seletor operacional." });
  };

  if (!allowedRole) return <div className="mx-auto max-w-3xl p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Kanban indisponível</h1><p className="mt-2 text-sm text-slate-500">Seu perfil não possui permissão para priorizar a fila operacional.</p></div>;

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 pb-8">
      <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Priorização</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Kanban operacional</h1><p className="mt-1 text-sm text-slate-500">Arraste para uma transição válida ou use o seletor de situação em cada cartão.</p></div><RefreshControls compact interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={() => list.refetch()} refreshing={list.isFetching} /></header>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="min-w-40">
          <p className="mb-1 text-xs font-medium text-slate-700">Prioridade</p>
          <Select value={priority} onValueChange={value => { setPriority(value as typeof priority); setPage(1); }}>
            <SelectTrigger aria-label="Filtrar prioridade no Kanban" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas</SelectItem><SelectItem value="critica">Crítica</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="baixa">Baixa</SelectItem></SelectContent>
          </Select>
        </div>
        <label className="min-w-48 flex-1 text-xs font-medium text-slate-700">Buscar por código ou categoria
          <input aria-label="Buscar ocorrências no Kanban" maxLength={120} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Código ou categoria" className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-offset-2" />
        </label>
        <div className="min-w-48">
          <p className="mb-1 text-xs font-medium text-slate-700">Ordenar cartões</p>
          <Select value={sortOrder} onValueChange={value => setSortOrder(value as KanbanSortOrder)}>
            <SelectTrigger aria-label="Ordenar ocorrências no Kanban" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="priority">Maior prioridade primeiro</SelectItem><SelectItem value="oldest">Mais antigas primeiro</SelectItem><SelectItem value="newest">Mais recentes primeiro</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="min-w-44">
          <p className="mb-1 text-xs font-medium text-slate-700">Equipe atribuída</p>
          <Select value={teamFilter} onValueChange={value => { setTeamFilter(value); setPage(1); }}>
            <SelectTrigger aria-label="Filtrar equipe no Kanban" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as equipes</SelectItem>
              {(teams.data ?? []).map(({ team }) => <SelectItem key={team.id} value={String(team.id)}>{team.code} — {team.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="min-w-36 text-xs font-medium text-slate-700">Aberta desde
          <input type="date" aria-label="Abertura desde" value={openedFrom} max={openedThrough || undefined} onChange={event => { setOpenedFrom(event.target.value); setPage(1); }} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" />
        </label>
        <label className="min-w-36 text-xs font-medium text-slate-700">Aberta até (inclusive)
          <input type="date" aria-label="Abertura até" value={openedThrough} min={openedFrom || undefined} onChange={event => { setOpenedThrough(event.target.value); setPage(1); }} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" />
        </label>
        <p className="text-xs text-slate-500" role="status">Página {page} de {totalPages}: {visibleRows.length} cartões carregados · {list.data?.total ?? 0} ocorrências encontradas</p>
      </div>
      {dateRangeInvalid && <p role="alert" className="text-sm text-rose-700">O fim do período não pode ser anterior ao início.</p>}
      {totalPages > 1 && <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-xs text-slate-500">A ordenação e as contagens de colunas consideram apenas a página atual; use Anterior/Próxima para consultar outros registros.</p>
        <Button variant="outline" size="sm" disabled={page <= 1 || list.isFetching} onClick={() => setPage(current => Math.max(1, current - 1))}>Anterior</Button>
        <span className="text-sm text-slate-700" aria-label="Página atual">{page}/{totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages || list.isFetching} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>Próxima</Button>
      </div>}
      <QueryState loading={list.isLoading} error={list.error} label="Kanban" />
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="overflow-x-auto pb-4"><div className="grid min-w-[1500px] grid-cols-7 gap-3">{boardColumns.map(column => {
        const cards = visibleRows.filter(({ incident }) => incident.status === column);
        return <section key={column} onDragOver={event => event.preventDefault()} onDrop={() => { const dragged = visibleRows.find(({ incident }) => incident.id === draggingId)?.incident; if (dragged) move(dragged.id, dragged.status, column, "kanban"); setDraggingId(null); }} className="min-h-[500px] rounded-2xl border border-slate-200 bg-slate-50/80"><div className="flex items-center justify-between border-b border-slate-200 px-3 py-3"><span className="text-xs font-semibold text-slate-700">{statusLabels[column]}</span><Badge variant="secondary" className="bg-white text-slate-600">{cards.length} nesta página</Badge></div><div className="space-y-3 p-2">{cards.map(({ incident, teamCode }) => <article key={incident.id} draggable onDragStart={() => setDraggingId(incident.id)} className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"><div className="flex items-start gap-1"><GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" /><button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/ocorrencias/${incident.id}`)}><p className="truncate text-sm font-semibold text-slate-900">{incident.category}</p><p className="mt-1 truncate text-[11px] text-slate-500">{incident.code}</p><p className="mt-1 text-[11px] font-medium text-slate-600">{formatIncidentAge(incident.createdAt, asOf)}</p></button></div><div className="mt-3 flex flex-wrap gap-1"><Badge className={`border-0 text-[10px] ring-1 ${priorityClasses[incident.priority]}`}>{priorityLabels[incident.priority]}</Badge>{teamCode && <Badge className="border-0 bg-sky-50 text-[10px] text-sky-800 ring-1 ring-sky-100">{teamCode}</Badge>}</div><div className="mt-3"><Select value={incident.status} onValueChange={value => move(incident.id, incident.status, value, "selector")}><SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{[incident.status, ...allowed[incident.status]].map(status => <SelectItem key={status} value={status} className="text-xs">{statusLabels[status]}</SelectItem>)}</SelectContent></Select></div></article>)}{cards.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Sem ocorrências</p>}</div></section>;
      })}</div></div>
    </div>
  );
}

export default function KanbanPage() { return <DashboardLayout><KanbanContent /></DashboardLayout>; }
