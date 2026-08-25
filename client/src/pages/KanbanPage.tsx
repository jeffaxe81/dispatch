import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { RefreshControls } from "@/components/RefreshControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { priorityClasses, priorityLabels, statusClasses, statusLabels } from "@/lib/operational";
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
  const utils = trpc.useUtils();
  const refresh = useRefreshSettings();
  const list = trpc.incidents.list.useQuery({ page: 1, pageSize: 100 }, { refetchInterval: refresh.interval || false });
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
      <QueryState loading={list.isLoading} error={list.error} label="Kanban" />
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="overflow-x-auto pb-4"><div className="grid min-w-[1500px] grid-cols-7 gap-3">{boardColumns.map(column => {
        const cards = (list.data?.rows ?? []).filter(({ incident }) => incident.status === column);
        return <section key={column} onDragOver={event => event.preventDefault()} onDrop={() => { const dragged = (list.data?.rows ?? []).find(({ incident }) => incident.id === draggingId)?.incident; if (dragged) move(dragged.id, dragged.status, column, "kanban"); setDraggingId(null); }} className="min-h-[500px] rounded-2xl border border-slate-200 bg-slate-50/80"><div className="flex items-center justify-between border-b border-slate-200 px-3 py-3"><span className="text-xs font-semibold text-slate-700">{statusLabels[column]}</span><Badge variant="secondary" className="bg-white text-slate-600">{cards.length}</Badge></div><div className="space-y-3 p-2">{cards.map(({ incident, teamCode }) => <article key={incident.id} draggable onDragStart={() => setDraggingId(incident.id)} className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"><div className="flex items-start gap-1"><GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" /><button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/ocorrencias/${incident.id}`)}><p className="truncate text-sm font-semibold text-slate-900">{incident.category}</p><p className="mt-1 truncate text-[11px] text-slate-500">{incident.code}</p></button></div><div className="mt-3 flex flex-wrap gap-1"><Badge className={`border-0 text-[10px] ring-1 ${priorityClasses[incident.priority]}`}>{priorityLabels[incident.priority]}</Badge>{teamCode && <Badge className="border-0 bg-sky-50 text-[10px] text-sky-800 ring-1 ring-sky-100">{teamCode}</Badge>}</div><div className="mt-3"><Select value={incident.status} onValueChange={value => move(incident.id, incident.status, value, "selector")}><SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{[incident.status, ...allowed[incident.status]].map(status => <SelectItem key={status} value={status} className="text-xs">{statusLabels[status]}</SelectItem>)}</SelectContent></Select></div></article>)}{cards.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Sem ocorrências</p>}</div></section>;
      })}</div></div>
    </div>
  );
}

export default function KanbanPage() { return <DashboardLayout><KanbanContent /></DashboardLayout>; }
