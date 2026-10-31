import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { RefreshControls } from "@/components/RefreshControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { priorityClasses, priorityLabels, statusLabels } from "@/lib/operational";
import { formatIncidentAge, prepareKanbanRows, type KanbanSortOrder } from "@/lib/kanbanQueue";
import { trpc } from "@/lib/trpc";
import { GripVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const boardColumns = ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada", "concluida"] as const;
type BoardStatus = (typeof boardColumns)[number];
type TargetStatus = BoardStatus | "cancelada";
type PriorityFilter = "todas" | "baixa" | "media" | "alta" | "critica";
type DraggedIncident = { id: number; status: string };
type KanbanFilters = {
  priority: PriorityFilter;
  search: string;
  sortOrder: KanbanSortOrder;
  teamId?: number;
  openedFrom?: Date;
  openedBefore?: Date;
};
const COLUMN_PAGE_SIZE = 20;
const allowed: Record<string, TargetStatus[]> = {
  triagem: ["aguardando_despacho", "cancelada"],
  aguardando_despacho: ["despachada", "cancelada"],
  despachada: ["aceita", "aguardando_despacho", "cancelada"],
  aceita: ["em_atendimento", "aguardando_despacho", "cancelada"],
  em_atendimento: ["pausada", "concluida", "cancelada"],
  pausada: ["em_atendimento", "cancelada"],
  concluida: [],
  cancelada: [],
};

/** Each column owns its page and server-filtered count; no global 100-item slice. */
function KanbanColumn({
  status, filters, interval, disabled, dragging, onDragStart, onDragEnd, onMove,
}: {
  status: BoardStatus;
  filters: KanbanFilters;
  interval: number | false;
  disabled: boolean;
  dragging: DraggedIncident | null;
  onDragStart: (incident: DraggedIncident) => void;
  onDragEnd: () => void;
  onMove: (incident: DraggedIncident, status: TargetStatus, source: "kanban" | "selector") => void;
}) {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const list = trpc.incidents.list.useQuery({
    status, page, pageSize: COLUMN_PAGE_SIZE,
    priority: filters.priority === "todas" ? undefined : filters.priority,
    search: filters.search.trim() || undefined,
    teamId: filters.teamId,
    openedFrom: filters.openedFrom,
    openedBefore: filters.openedBefore,
  }, { refetchInterval: interval, enabled: !disabled, retry: false });
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / COLUMN_PAGE_SIZE));
  const cards = prepareKanbanRows(list.data?.rows ?? [], {
    priority: filters.priority,
    query: filters.search,
    sort: filters.sortOrder,
  });

  useEffect(() => {
    if (list.data && page > totalPages) setPage(totalPages);
  }, [list.data, page, totalPages]);

  return (
    <section
      aria-label={"Coluna " + statusLabels[status]}
      onDragOver={event => { if (dragging) event.preventDefault(); }}
      onDrop={event => {
        event.preventDefault();
        if (dragging) onMove(dragging, status, "kanban");
        onDragEnd();
      }}
      className="min-h-[500px] rounded-2xl border border-slate-200 bg-slate-50/80"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
        <span className="text-xs font-semibold text-slate-700">{statusLabels[status]}</span>
        <Badge variant="secondary" className="bg-white text-slate-600">{total} no total</Badge>
      </div>
      <QueryState loading={list.isLoading} error={list.error} label={statusLabels[status]} />
      <div className="space-y-3 p-2">
        {cards.map(({ incident, teamCode }) => (
          <article
            key={incident.id}
            draggable
            onDragStart={() => onDragStart({ id: incident.id, status: incident.status })}
            onDragEnd={onDragEnd}
            className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
          >
            <div className="flex items-start gap-1">
              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate("/ocorrencias/" + incident.id)}>
                <p className="truncate text-sm font-semibold text-slate-900">{incident.category}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">{incident.code}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-600">{formatIncidentAge(incident.createdAt, new Date())}</p>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              <Badge className={"border-0 text-[10px] ring-1 " + priorityClasses[incident.priority]}>{priorityLabels[incident.priority]}</Badge>
              {teamCode && <Badge className="border-0 bg-sky-50 text-[10px] text-sky-800 ring-1 ring-sky-100">{teamCode}</Badge>}
            </div>
            <div className="mt-3">
              <Select value={incident.status} onValueChange={value => onMove({ id: incident.id, status: incident.status }, value as TargetStatus, "selector")}>
                <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[incident.status, ...allowed[incident.status]].map(nextStatus => (
                    <SelectItem key={nextStatus} value={nextStatus} className="text-xs">{statusLabels[nextStatus]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </article>
        ))}
        {!list.isLoading && !list.isError && cards.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Sem ocorrências nesta etapa</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-slate-200 px-2 py-3 text-xs">
        <span className="text-slate-600">{total === 0 ? "0 cartões" : "Página " + page + "/" + totalPages}</span>
        <div className="flex gap-1">
          <Button
            size="sm" variant="outline"
            aria-label={"Página anterior de " + statusLabels[status]}
            disabled={page <= 1 || list.isFetching || disabled}
            onClick={() => setPage(value => Math.max(1, value - 1))}
          >Anterior</Button>
          <Button
            size="sm" variant="outline"
            aria-label={"Próxima página de " + statusLabels[status]}
            disabled={page >= totalPages || list.isFetching || disabled}
            onClick={() => setPage(value => Math.min(totalPages, value + 1))}
          >Próxima</Button>
        </div>
      </div>
    </section>
  );
}

function KanbanContent() {
  const { user } = useAuth();
  const [dragging, setDragging] = useState<DraggedIncident | null>(null);
  const [error, setError] = useState("");
  const [priority, setPriority] = useState<PriorityFilter>("todas");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<KanbanSortOrder>("priority");
  const [teamFilter, setTeamFilter] = useState("todas");
  const [openedFrom, setOpenedFrom] = useState("");
  const [openedThrough, setOpenedThrough] = useState("");
  const utils = trpc.useUtils();
  const refresh = useRefreshSettings();
  const teams = trpc.teams.list.useQuery(undefined, { retry: false });
  const openedBefore = openedThrough ? new Date(Date.parse(openedThrough + "T00:00:00.000Z") + 86_400_000) : undefined;
  const dateRangeInvalid = Boolean(openedFrom && openedThrough && openedFrom > openedThrough);
  const filters: KanbanFilters = {
    priority, search, sortOrder,
    teamId: teamFilter === "todas" ? undefined : Number(teamFilter),
    openedFrom: openedFrom ? new Date(openedFrom + "T00:00:00.000Z") : undefined,
    openedBefore,
  };
  // Remount each column when the server-side filters change, resetting its
  // page independently to 1. Changing the client-side sort does not reset pages.
  const filtersKey = [priority, search, teamFilter, openedFrom, openedThrough].join("|");
  const transition = trpc.incidents.transition.useMutation({
    onSuccess: () => {
      void utils.incidents.list.invalidate();
      void utils.dashboard.summary.invalidate();
      setError("");
    },
    onError: mutationError => setError(mutationError.message),
  });
  const allowedRole = ["despachador", "supervisor", "administrador"].includes(user?.operationalRole ?? "");

  const move = (incident: DraggedIncident, nextStatus: TargetStatus, source: "kanban" | "selector") => {
    if (!allowed[incident.status]?.includes(nextStatus)) {
      setError("Essa mudança não é permitida pelo ciclo de vida da ocorrência.");
      return;
    }
    transition.mutate({
      incidentId: incident.id, nextStatus,
      note: source === "kanban" ? "Situação atualizada pelo quadro Kanban." : "Situação atualizada pelo seletor operacional.",
    });
  };

  if (!allowedRole) return <div className="mx-auto max-w-3xl p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Kanban indisponível</h1><p className="mt-2 text-sm text-slate-500">Seu perfil não possui permissão para priorizar a fila operacional.</p></div>;

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 pb-8">
      <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Priorização</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Kanban operacional</h1><p className="mt-1 text-sm text-slate-500">Cada coluna consulta sua etapa com paginação independente. Arraste para uma transição válida ou use o seletor de situação.</p></div>
        <RefreshControls compact interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={() => utils.incidents.list.invalidate()} refreshing={false} />
      </header>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="min-w-40">
          <p className="mb-1 text-xs font-medium text-slate-700">Prioridade</p>
          <Select value={priority} onValueChange={value => setPriority(value as PriorityFilter)}>
            <SelectTrigger aria-label="Filtrar prioridade no Kanban" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas</SelectItem><SelectItem value="critica">Crítica</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="baixa">Baixa</SelectItem></SelectContent>
          </Select>
        </div>
        <label className="min-w-48 flex-1 text-xs font-medium text-slate-700">Buscar por código ou categoria
          <input aria-label="Buscar ocorrências no Kanban" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} placeholder="Código ou categoria" className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-offset-2" />
        </label>
        <div className="min-w-48">
          <p className="mb-1 text-xs font-medium text-slate-700">Ordenar cartões</p>
          <Select value={sortOrder} onValueChange={value => setSortOrder(value as KanbanSortOrder)}>
            <SelectTrigger aria-label="Ordenar ocorrências no Kanban" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="priority">Maior prioridade nesta página</SelectItem><SelectItem value="oldest">Mais antigas nesta página</SelectItem><SelectItem value="newest">Mais recentes nesta página</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="min-w-44">
          <p className="mb-1 text-xs font-medium text-slate-700">Equipe atribuída</p>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger aria-label="Filtrar equipe no Kanban" className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas as equipes</SelectItem>{(teams.data ?? []).map(({ team }) => <SelectItem key={team.id} value={String(team.id)}>{team.code} — {team.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="min-w-36 text-xs font-medium text-slate-700">Aberta desde
          <input type="date" aria-label="Abertura desde" value={openedFrom} max={openedThrough || undefined} onChange={event => setOpenedFrom(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" />
        </label>
        <label className="min-w-36 text-xs font-medium text-slate-700">Aberta até (inclusive)
          <input type="date" aria-label="Abertura até" value={openedThrough} min={openedFrom || undefined} onChange={event => setOpenedThrough(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" />
        </label>
      </div>
      {dateRangeInvalid && <p role="alert" className="text-sm text-rose-700">O fim do período não pode ser anterior ao início.</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <p className="text-xs text-slate-500">Cada contagem representa a etapa inteira conforme os filtros. A ordenação é aplicada somente aos cartões carregados em cada página de 20; não representa uma ordenação global de prioridades.</p>
      <div className="overflow-x-auto pb-4">
        <div className="grid min-w-[1500px] grid-cols-7 gap-3">
          {boardColumns.map(status => (
            <KanbanColumn
              key={status + "|" + filtersKey}
              status={status}
              filters={filters}
              interval={refresh.interval || false}
              disabled={dateRangeInvalid}
              dragging={dragging}
              onDragStart={setDragging}
              onDragEnd={() => setDragging(null)}
              onMove={move}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function KanbanPage() { return <DashboardLayout><KanbanContent /></DashboardLayout>; }
