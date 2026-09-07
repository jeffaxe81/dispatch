import DashboardLayout from "@/components/DashboardLayout";
import { OperationalMap } from "@/components/OperationalMap";
import { QueryState } from "@/components/QueryState";
import { RefreshControls } from "@/components/RefreshControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { formatDateTime, formatDuration, priorityClasses, priorityLabels, statusClasses, statusLabels } from "@/lib/operational";
import { trpc } from "@/lib/trpc";
import { WorkspaceOperationLauncher } from "@/workspace/multimonitor/WorkspaceOperationLauncher";
import { Activity, ArrowRight, Clock3, MapPinned, Plus, Radio, ShieldCheck, UsersRound } from "lucide-react";
import { useLocation } from "wouter";

function Metric({ label, value, detail, icon: Icon, accent }: { label: string; value: string | number; detail: string; icon: typeof Activity; accent: string }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`rounded-xl p-2.5 ${accent}`}><Icon className="h-5 w-5" /></span>
      </CardContent>
    </Card>
  );
}

function HomeContent() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const refresh = useRefreshSettings();
  const summary = trpc.dashboard.summary.useQuery(undefined, { refetchInterval: refresh.interval || false });
  const incidents = trpc.incidents.list.useQuery({ page: 1, pageSize: 100 }, { refetchInterval: refresh.interval || false });
  const teams = trpc.teams.list.useQuery(undefined, { refetchInterval: refresh.interval || false });
  const mapSettings = trpc.settings.operationalMap.useQuery();
  const workspaceLayout = trpc.workspace.getOwn.useQuery({ name: "default" });
  const canCreate = ["operador", "despachador", "supervisor", "administrador"].includes(user?.operationalRole ?? "");
  const canDispatch = ["despachador", "supervisor", "administrador"].includes(user?.operationalRole ?? "");

  const mapIncidents = (incidents.data?.rows ?? []).map(row => ({
    id: row.incident.id,
    code: row.incident.code,
    category: row.incident.category,
    priority: row.incident.priority,
    status: row.incident.status,
    latitude: row.incident.latitude,
    longitude: row.incident.longitude,
  }));
  const mapTeams = (teams.data ?? []).map(row => row.team);
  const refreshAll = () => Promise.all([summary.refetch(), incidents.refetch(), teams.refetch()]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
      <header className="flex flex-col gap-4 rounded-2xl bg-[radial-gradient(circle_at_78%_0%,rgba(13,148,136,.18),transparent_34%),linear-gradient(110deg,#082f49,#0f766e)] px-6 py-7 text-white shadow-lg shadow-slate-900/10 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100"><Radio className="h-3.5 w-3.5" /> Operação conectada</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Central de despacho</h1>
          <p className="mt-1 max-w-2xl text-sm text-cyan-50/90">Acompanhe ocorrências, recursos em campo e decisões de atendimento sem perder o contexto operacional.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workspaceLayout.data && <WorkspaceOperationLauncher screens={workspaceLayout.data.screens} />}
          {canCreate && <Button onClick={() => navigate("/ocorrencias")} className="bg-white text-slate-900 hover:bg-cyan-50"><Plus className="mr-2 h-4 w-4" />Nova ocorrência</Button>}
          {canDispatch && <Button variant="outline" onClick={() => navigate("/kanban")} className="border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ShieldCheck className="mr-2 h-4 w-4" />Priorizar fila</Button>}
        </div>
      </header>
      <RefreshControls interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={refreshAll} refreshing={summary.isFetching || incidents.isFetching || teams.isFetching} />
      <QueryState loading={summary.isLoading || incidents.isLoading || teams.isLoading} error={summary.error ?? incidents.error ?? teams.error} label="painel operacional" />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Ocorrências ativas" value={summary.data?.activeIncidents ?? "—"} detail="Triagem, despacho e atendimento" icon={Activity} accent="bg-rose-50 text-rose-700" />
        <Metric label="Equipes disponíveis" value={summary.data?.availableTeams ?? "—"} detail="Recursos aptos para despacho" icon={UsersRound} accent="bg-emerald-50 text-emerald-700" />
        <Metric label="Resposta média" value={formatDuration(summary.data?.averageResponseSeconds)} detail="Da abertura ao aceite" icon={Clock3} accent="bg-amber-50 text-amber-700" />
        <Metric label="Atualização" value={refresh.label} detail={refresh.interval ? "Consulta automática configurada" : "Atualização por comando manual"} icon={Radio} accent="bg-sky-50 text-sky-700" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <OperationalMap incidents={mapIncidents} teams={mapTeams} settings={mapSettings.data} />
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-950">Fila prioritária</h2>
                <p className="text-xs text-slate-500">Ordenada por gravidade e abertura</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/ocorrencias")} className="text-sky-700">Ver todas<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
            </div>
            <div className="divide-y divide-slate-100">
              {(summary.data?.priorityQueue ?? []).map(incident => (
                <button key={incident.id} onClick={() => navigate(`/ocorrencias/${incident.id}`)} className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50">
                  <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3"><strong className="truncate text-sm text-slate-900">{incident.category}</strong><Badge className={`shrink-0 border-0 ring-1 ${priorityClasses[incident.priority]}`}>{priorityLabels[incident.priority]}</Badge></span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{incident.code} · {incident.address}</span>
                    <span className="mt-2 flex items-center gap-2"><Badge className={`border-0 text-[10px] ring-1 ${statusClasses[incident.status]}`}>{statusLabels[incident.status]}</Badge><small className="text-[10px] text-slate-400">{formatDateTime(incident.createdAt)}</small></span>
                  </span>
                </button>
              ))}
              {!summary.isLoading && (summary.data?.priorityQueue.length ?? 0) === 0 && <div className="px-5 py-12 text-center text-sm text-slate-500">Nenhuma ocorrência ativa na fila.</div>}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default function Home() {
  return <DashboardLayout><HomeContent /></DashboardLayout>;
}
