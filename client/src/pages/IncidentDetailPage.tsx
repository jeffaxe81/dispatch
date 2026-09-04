import DashboardLayout from "@/components/DashboardLayout";
import LeafletOperationalMap from "@/components/LeafletOperationalMap";
import NeoOperationalWorkspace from "@/components/NeoOperationalWorkspace";
import { QueryState } from "@/components/QueryState";
import { RefreshControls } from "@/components/RefreshControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { canViewEmbeddedApplications } from "@/lib/embeddedAppAccess";
import { formatDateTime, priorityClasses, priorityLabels, statusClasses, statusLabels } from "@/lib/operational";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, MapPin, MonitorSmartphone, Navigation, Send, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";

const allowedTransitions: Record<string, string[]> = {
  triagem: ["aguardando_despacho", "cancelada"],
  aguardando_despacho: ["despachada", "cancelada"],
  despachada: ["aceita", "aguardando_despacho", "cancelada"],
  aceita: ["em_atendimento", "aguardando_despacho", "cancelada"],
  em_atendimento: ["pausada", "concluida", "cancelada"],
  pausada: ["em_atendimento", "cancelada"],
  concluida: [],
  cancelada: [],
};
type TransitionStatus = "triagem" | "aguardando_despacho" | "despachada" | "aceita" | "em_atendimento" | "pausada" | "concluida" | "cancelada";

function IncidentDetailContent() {
  const { user } = useAuth();
  const [, params] = useRoute("/ocorrencias/:id");
  const [, navigate] = useLocation();
  const incidentId = Number(params?.id);
  const [assignOpen, setAssignOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [neoOpen, setNeoOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [teamId, setTeamId] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState({ category: "", priority: "media", requesterName: "", requesterContact: "", description: "", address: "", latitude: "", longitude: "" });
  const utils = trpc.useUtils();
  const refresh = useRefreshSettings();
  const detail = trpc.incidents.get.useQuery({ incidentId }, { enabled: Number.isInteger(incidentId) && incidentId > 0, refetchInterval: refresh.interval || false });
  const timeline = trpc.incidents.timeline.useQuery({ incidentId }, { enabled: Number.isInteger(incidentId) && incidentId > 0, refetchInterval: refresh.interval || false });
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const canOpenNeo = canViewEmbeddedApplications(access.data?.permissions);
  const embeddedApplications = trpc.integrations.embeddedApplications.list.useQuery(undefined, { enabled: neoOpen && canOpenNeo, retry: false });
  const teams = trpc.teams.list.useQuery(undefined, { enabled: assignOpen });
  const mapSettings = trpc.settings.operationalMap.useQuery(undefined, { enabled: assignOpen });
  const incident = detail.data?.incident;
  const availablePositionedTeams = (teams.data ?? [])
    .filter(row => row.team.status === "disponivel")
    .filter(row => Number.isFinite(Number(row.team.lastLatitude)) && Number.isFinite(Number(row.team.lastLongitude)))
    .map(row => ({
      teamId: row.team.id,
      code: row.team.code,
      name: row.team.name,
      status: row.team.status,
      position: { latitude: Number(row.team.lastLatitude), longitude: Number(row.team.lastLongitude) },
    }));
  const rankedTeams = trpc.gis.rankCandidates.useQuery({
    incident: {
      latitude: Number(incident?.latitude ?? 0),
      longitude: Number(incident?.longitude ?? 0),
    },
    candidates: availablePositionedTeams,
    maxRouteCandidates: 3,
  }, {
    enabled: assignOpen && Boolean(incident) && availablePositionedTeams.length > 0,
    retry: false,
  });
  const canDispatch = ["despachador", "supervisor", "administrador"].includes(user?.operationalRole ?? "");
  const canAudit = ["supervisor", "administrador"].includes(user?.operationalRole ?? "");
  const audit = trpc.incidents.audit.useQuery({ incidentId }, { enabled: canAudit && Number.isInteger(incidentId) });
  const assign = trpc.incidents.assign.useMutation({ onSuccess: () => { utils.incidents.get.invalidate({ incidentId }); utils.incidents.timeline.invalidate({ incidentId }); utils.incidents.list.invalidate(); utils.dashboard.summary.invalidate(); setAssignOpen(false); } });
  const transition = trpc.incidents.transition.useMutation({ onSuccess: () => { utils.incidents.get.invalidate({ incidentId }); utils.incidents.timeline.invalidate({ incidentId }); utils.incidents.list.invalidate(); utils.dashboard.summary.invalidate(); setTransitionOpen(false); setNote(""); } });
  const update = trpc.incidents.update.useMutation({ onSuccess: () => { utils.incidents.get.invalidate({ incidentId }); utils.incidents.timeline.invalidate({ incidentId }); utils.incidents.list.invalidate(); setEditOpen(false); } });
  const permanentlyDelete = trpc.incidents.permanentlyDelete.useMutation({ onSuccess: () => { utils.incidents.list.invalidate(); utils.dashboard.summary.invalidate(); setDeleteOpen(false); navigate("/ocorrencias"); } });
  const canTransition = user?.operationalRole !== "agente" && incident && allowedTransitions[incident.status].length > 0;
  const canEdit = ["operador", "despachador", "supervisor", "administrador"].includes(user?.operationalRole ?? "");
  const canPermanentlyDelete = Boolean(access.data?.isSuperAdministrator);
  const openEdit = () => {
    if (!incident) return;
    setEdit({ category: incident.category, priority: incident.priority, requesterName: incident.requesterName ?? "", requesterContact: incident.requesterContact ?? "", description: incident.description, address: incident.address, latitude: incident.latitude, longitude: incident.longitude });
    setEditOpen(true);
  };

  if (detail.isLoading || detail.error) return <QueryState loading={detail.isLoading} error={detail.error} label="ocorrência" />;
  if (!incident) return <div className="p-8 text-sm text-slate-500">Ocorrência não encontrada ou sem autorização.</div>;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-8">
      <Button variant="ghost" onClick={() => navigate("/ocorrencias")} className="-ml-3 text-slate-600"><ArrowLeft className="mr-2 h-4 w-4" />Voltar às ocorrências</Button>
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-start md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className={`border-0 ring-1 ${priorityClasses[incident.priority]}`}>{priorityLabels[incident.priority]}</Badge><Badge className={`border-0 ring-1 ${statusClasses[incident.status]}`}>{statusLabels[incident.status]}</Badge></div><h1 className="mt-3 text-2xl font-semibold text-slate-950">{incident.category}</h1><p className="mt-1 text-sm text-slate-500">{incident.code} · Registrada em {formatDateTime(incident.createdAt)}</p></div><div className="flex flex-wrap justify-end gap-2"><RefreshControls compact interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={() => Promise.all([detail.refetch(), timeline.refetch()])} refreshing={detail.isFetching || timeline.isFetching} />{canEdit && <Button variant="outline" onClick={openEdit}>Editar dados</Button>}{canOpenNeo && <Button variant="outline" onClick={() => setNeoOpen(true)}><MonitorSmartphone className="mr-2 h-4 w-4" />Comunicação NEO</Button>}{canDispatch && (incident.status === "triagem" || incident.status === "aguardando_despacho") && <Button onClick={() => setAssignOpen(true)}><Send className="mr-2 h-4 w-4" />Despachar equipe</Button>}{canTransition && <Button variant="outline" onClick={() => setTransitionOpen(true)}><CheckCircle2 className="mr-2 h-4 w-4" />Atualizar situação</Button>}{canPermanentlyDelete && <Button variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => setDeleteOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Excluir permanentemente</Button>}</div></header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5"><Card className="border-slate-200 shadow-sm"><CardContent className="grid gap-6 p-6 md:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Local</p><p className="mt-2 flex items-start gap-2 text-sm text-slate-800"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />{incident.address}</p><p className="mt-2 text-xs text-slate-500">{incident.latitude}, {incident.longitude}</p></div><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Solicitante</p><p className="mt-2 flex items-center gap-2 text-sm text-slate-800"><UserRound className="h-4 w-4 text-sky-700" />{incident.requesterName ?? "Não informado"}</p><p className="mt-2 text-xs text-slate-500">{incident.requesterContact ?? "Sem contato cadastrado"}</p></div><div className="md:col-span-2"><p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Descrição inicial</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{incident.description}</p></div></CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="border-b border-slate-100 px-6 py-4"><h2 className="font-semibold text-slate-950">Cronologia</h2></div><ol className="divide-y divide-slate-100">{(timeline.data ?? []).map(({ event, actorName, teamCode }) => <li key={event.id} className="flex gap-4 px-6 py-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600" /><div><p className="text-sm text-slate-800">{event.message}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(event.createdAt)} · {actorName ?? "Sistema"}{teamCode ? ` · ${teamCode}` : ""}</p></div></li>)}{!timeline.isLoading && (timeline.data?.length ?? 0) === 0 && <li className="px-6 py-10 text-center text-sm text-slate-500">Ainda não há eventos para esta ocorrência.</li>}</ol></CardContent></Card>
        </div>
        <aside className="space-y-5"><Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sky-700" /><h2 className="font-semibold text-slate-950">Despacho atual</h2></div><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Equipe</dt><dd className="font-medium text-slate-800">{detail.data?.teamCode ?? "Não atribuída"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Viatura</dt><dd className="font-medium text-slate-800">{detail.data?.vehiclePrefix ?? "—"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Despachada</dt><dd className="font-medium text-slate-800">{formatDateTime(incident.dispatchedAt)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Aceita</dt><dd className="font-medium text-slate-800">{formatDateTime(incident.acceptedAt)}</dd></div></dl></CardContent></Card>
          {canAudit && <Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><ClipboardList className="h-4 w-4 text-sky-700" /><h2 className="font-semibold text-slate-950">Auditoria</h2></div><div className="divide-y divide-slate-100">{(audit.data ?? []).map(({ audit: row, actorName }) => <div key={row.id} className="px-5 py-3"><p className="text-xs font-medium text-slate-800">{row.action}</p><p className="mt-1 text-[11px] text-slate-500">{actorName ?? "Sistema"} · {formatDateTime(row.createdAt)}</p></div>)}{!audit.isLoading && (audit.data?.length ?? 0) === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Sem registros de auditoria.</p>}</div></CardContent></Card>}
        </aside>
      </div>
      <NeoOperationalWorkspace
        open={neoOpen}
        onOpenChange={setNeoOpen}
        application={embeddedApplications.data?.find(application => application.id === "neo-interact") ?? null}
        incident={{
          code: incident.code,
          category: incident.category,
          priorityLabel: priorityLabels[incident.priority],
          statusLabel: statusLabels[incident.status],
          address: incident.address,
          requesterName: incident.requesterName,
          requesterContact: incident.requesterContact,
          description: incident.description,
        }}
        teamCode={detail.data?.teamCode}
        vehiclePrefix={detail.data?.vehiclePrefix}
      />
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}><DialogContent><DialogHeader><DialogTitle>Despachar equipe</DialogTitle><DialogDescription>O despacho criará um evento, uma atribuição pendente e uma auditoria da operação.</DialogDescription></DialogHeader><div className="grid gap-4 py-2">
        {rankedTeams.isLoading && <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900">Calculando proximidade e ETA das equipes posicionadas...</div>}
        {rankedTeams.data?.[0] && <button type="button" onClick={() => setTeamId(String(rankedTeams.data![0].teamId))} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left transition-colors hover:bg-emerald-100"><div className="flex items-start gap-3"><Navigation className="mt-0.5 h-5 w-5 text-emerald-700" /><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-emerald-700">Sugestão por proximidade</p><p className="mt-1 font-semibold text-emerald-950">{rankedTeams.data[0].code} · {rankedTeams.data[0].name}</p><p className="mt-1 text-xs text-emerald-900">{rankedTeams.data[0].route ? `${Math.round(rankedTeams.data[0].route!.distanceMeters / 100) / 10} km · ETA aproximado ${Math.max(1, Math.round(rankedTeams.data[0].route!.durationSeconds / 60))} min` : `${Math.round(rankedTeams.data[0].straightLineDistanceMeters / 100) / 10} km em linha reta · ETA indisponível`}</p></div></div></button>}
        {rankedTeams.data?.[0]?.route && <div className="overflow-hidden rounded-xl border border-slate-200">
          <LeafletOperationalMap
            center={{ lat: Number(incident.latitude), lng: Number(incident.longitude) }}
            zoom={mapSettings.data?.defaultZoom ?? 13}
            className="h-64 w-full"
            incidents={[{ id: incident.id, code: incident.code, category: incident.category, priority: incident.priority, latitude: incident.latitude, longitude: incident.longitude }]}
            teams={[{ id: rankedTeams.data[0].teamId, code: rankedTeams.data[0].code, name: rankedTeams.data[0].name, status: rankedTeams.data[0].status, latitude: rankedTeams.data[0].position.latitude, longitude: rankedTeams.data[0].position.longitude }]}
            route={rankedTeams.data[0].route.geometry}
          />
        </div>}
        {rankedTeams.error && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Não foi possível calcular ETA agora. O despacho manual continua disponível.</div>}
        <div className="grid gap-2"><Label>Equipe disponível</Label><Select value={teamId} onValueChange={setTeamId}><SelectTrigger><SelectValue placeholder="Selecione uma equipe" /></SelectTrigger><SelectContent>{(rankedTeams.data?.length ? rankedTeams.data.map(candidate => ({ id: candidate.teamId, code: candidate.code, name: candidate.name, eta: candidate.route?.durationSeconds })) : (teams.data ?? []).filter(row => row.team.status === "disponivel").map(row => ({ id: row.team.id, code: row.team.code, name: row.team.name, eta: undefined }))).map(candidate => <SelectItem key={candidate.id} value={String(candidate.id)}>{candidate.code} · {candidate.name}{candidate.eta ? ` · ~${Math.max(1, Math.round(candidate.eta / 60))} min` : ""}</SelectItem>)}</SelectContent></Select></div>{assign.error && <p className="text-sm text-rose-700">{assign.error.message}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAssignOpen(false)}>Cancelar</Button><Button disabled={!teamId || assign.isPending} onClick={() => assign.mutate({ incidentId, teamId: Number(teamId) })}>Confirmar despacho</Button></div></div></DialogContent></Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Editar dados da ocorrência</DialogTitle><DialogDescription>As alterações autorizadas serão incluídas na cronologia e na trilha de auditoria.</DialogDescription></DialogHeader><form className="grid gap-4 py-2" onSubmit={event => { event.preventDefault(); update.mutate({ incidentId, category: edit.category, priority: edit.priority as "baixa" | "media" | "alta" | "critica", requesterName: edit.requesterName || null, requesterContact: edit.requesterContact || null, description: edit.description, address: edit.address, latitude: Number(edit.latitude), longitude: Number(edit.longitude) }); }}><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Tipificação</Label><Input value={edit.category} onChange={event => setEdit(current => ({ ...current, category: event.target.value }))} required /></div><div className="grid gap-2"><Label>Prioridade</Label><Select value={edit.priority} onValueChange={priority => setEdit(current => ({ ...current, priority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Solicitante</Label><Input value={edit.requesterName} onChange={event => setEdit(current => ({ ...current, requesterName: event.target.value }))} /></div><div className="grid gap-2"><Label>Contato</Label><Input value={edit.requesterContact} onChange={event => setEdit(current => ({ ...current, requesterContact: event.target.value }))} /></div></div><div className="grid gap-2"><Label>Endereço</Label><Input value={edit.address} onChange={event => setEdit(current => ({ ...current, address: event.target.value }))} required /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Latitude</Label><Input type="number" step="0.0000001" value={edit.latitude} onChange={event => setEdit(current => ({ ...current, latitude: event.target.value }))} required /></div><div className="grid gap-2"><Label>Longitude</Label><Input type="number" step="0.0000001" value={edit.longitude} onChange={event => setEdit(current => ({ ...current, longitude: event.target.value }))} required /></div></div><div className="grid gap-2"><Label>Descrição</Label><Textarea rows={4} value={edit.description} onChange={event => setEdit(current => ({ ...current, description: event.target.value }))} required /></div>{update.error && <p className="text-sm text-rose-700">{update.error.message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button><Button disabled={update.isPending}>Salvar alterações</Button></div></form></DialogContent></Dialog>
      <Dialog open={deleteOpen} onOpenChange={open => { setDeleteOpen(open); if (!open) { setDeleteConfirmation(""); setDeleteReason(""); } }}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2 text-rose-800"><AlertTriangle className="h-5 w-5" />Excluir ocorrência permanentemente</DialogTitle><DialogDescription>Esta ação é exclusiva do Super Administrador, remove a ocorrência e seus eventos operacionais do fluxo ativo e não pode ser desfeita. O retrato completo da operação e o motivo permanecerão no Log de operações.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><strong>Ocorrência:</strong> {incident.code} · {incident.category}</div><div className="grid gap-2"><Label>Motivo da exclusão</Label><Textarea value={deleteReason} onChange={event => setDeleteReason(event.target.value)} placeholder="Ex.: ocorrência cadastrada em duplicidade após confirmação da central." rows={3} /></div><div className="grid gap-2"><Label>Confirmação reforçada</Label><Input value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder={`Digite EXCLUIR ${incident.code}`} /><p className="text-xs text-slate-500">Digite exatamente <strong>EXCLUIR {incident.code}</strong> para liberar a exclusão.</p></div>{permanentlyDelete.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{permanentlyDelete.error.message}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={deleteReason.trim().length < 10 || deleteConfirmation.trim().toUpperCase() !== `EXCLUIR ${incident.code}`.toUpperCase() || permanentlyDelete.isPending} onClick={() => permanentlyDelete.mutate({ incidentId, reason: deleteReason.trim() })}>{permanentlyDelete.isPending ? "Excluindo..." : "Confirmar exclusão permanente"}</Button></div></div></DialogContent></Dialog>
      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}><DialogContent><DialogHeader><DialogTitle>Atualizar situação</DialogTitle><DialogDescription>A mudança é validada pelo servidor e registrada na cronologia e auditoria.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Próxima situação</Label><Select value={nextStatus} onValueChange={setNextStatus}><SelectTrigger><SelectValue placeholder="Selecione a situação" /></SelectTrigger><SelectContent>{allowedTransitions[incident.status].map(item => <SelectItem key={item} value={item}>{statusLabels[item]}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Registro operacional</Label><Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Informe o motivo ou a atualização relevante." /></div>{transition.error && <p className="text-sm text-rose-700">{transition.error.message}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setTransitionOpen(false)}>Cancelar</Button><Button disabled={!nextStatus || note.trim().length < 3 || transition.isPending} onClick={() => transition.mutate({ incidentId, nextStatus: nextStatus as TransitionStatus, note })}>Confirmar alteração</Button></div></div></DialogContent></Dialog>
    </div>
  );
}

export default function IncidentDetailPage() { return <DashboardLayout><IncidentDetailContent /></DashboardLayout>; }
