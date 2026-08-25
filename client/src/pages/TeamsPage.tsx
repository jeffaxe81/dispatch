import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { RefreshControls } from "@/components/RefreshControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { formatDateTime } from "@/lib/operational";
import { trpc } from "@/lib/trpc";
import { CarFront, Clock3, Coffee, MapPin, Pause, Play, Plus, Radio, Square, UsersRound } from "lucide-react";
import { useState } from "react";

const teamLabels: Record<string, string> = { disponivel: "Disponível", em_deslocamento: "Em deslocamento", em_atendimento: "Em atendimento", pausada: "Pausada", indisponivel: "Indisponível" };
const teamClasses: Record<string, string> = { disponivel: "bg-emerald-50 text-emerald-800 ring-emerald-200", em_deslocamento: "bg-sky-50 text-sky-800 ring-sky-200", em_atendimento: "bg-violet-50 text-violet-800 ring-violet-200", pausada: "bg-amber-50 text-amber-800 ring-amber-200", indisponivel: "bg-rose-50 text-rose-800 ring-rose-200" };
type TeamStatus = "disponivel" | "em_deslocamento" | "em_atendimento" | "pausada" | "indisponivel";
type ShiftAction = "start" | "pause" | "resume" | "end";

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 3600)}h ${String(Math.floor((safe % 3600) / 60)).padStart(2, "0")}min`;
}

function shiftState(team: { shiftStartedAt: Date | null; shiftPausedAt: Date | null; shiftEndsAt: Date | null }) {
  if (!team.shiftStartedAt) return { label: "Não iniciada", className: "bg-slate-100 text-slate-700" };
  if (team.shiftEndsAt) return { label: "Encerrada", className: "bg-slate-100 text-slate-700" };
  if (team.shiftPausedAt) return { label: "Em pausa", className: "bg-amber-100 text-amber-900" };
  return { label: "Em andamento", className: "bg-emerald-100 text-emerald-900" };
}

function TeamsContent() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [agency, setAgency] = useState("");
  const [organizationId, setOrganizationId] = useState("none");
  const [organizationalUnitId, setOrganizationalUnitId] = useState("none");
  const utils = trpc.useUtils();
  const refresh = useRefreshSettings();
  const teams = trpc.teams.list.useQuery(undefined, { refetchInterval: refresh.interval || false });
  const scopes = trpc.access.scopes.useQuery();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const updateStatus = trpc.teams.updateStatus.useMutation({ onSuccess: () => { void utils.teams.list.invalidate(); void utils.dashboard.summary.invalidate(); } });
  const updateShift = trpc.teams.updateShift.useMutation({ onSuccess: () => void utils.teams.list.invalidate() });
  const create = trpc.teams.create.useMutation({ onSuccess: () => { void utils.teams.list.invalidate(); setCreateOpen(false); setCode(""); setName(""); setAgency(""); setOrganizationId("none"); setOrganizationalUnitId("none"); } });
  const can = (permission: string) => access.data ? access.data.permissions.includes(permission) : user?.operationalRole === "administrador";
  const canManage = can("teams.manage");

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
    <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Recursos de campo</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Equipes</h1><p className="mt-1 text-sm text-slate-500">Disponibilidade, jornada de trabalho, viatura vinculada e última posição recebida.</p></div><div className="flex flex-wrap items-center gap-2"><RefreshControls compact interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={() => teams.refetch()} refreshing={teams.isFetching} />{canManage && <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Cadastrar equipe</Button>}</div></header>
    <Card className="border-sky-100 bg-sky-50/55"><CardContent className="flex gap-3 p-4 text-sm text-sky-950"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><p><strong>Controle de jornada.</strong> Início, pausa, retorno e encerramento ficam auditados. O status operacional da equipe não é alterado automaticamente pela jornada.</p></CardContent></Card>
    <QueryState loading={teams.isLoading} error={teams.error} label="equipes" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(teams.data ?? []).map(({ team, vehiclePrefix, vehicleType }) => {
      const state = shiftState(team);
      const active = Boolean(team.shiftStartedAt && !team.shiftEndsAt);
      const paused = Boolean(active && team.shiftPausedAt);
      const mayControl = canManage || (user?.operationalRole === "agente" && user.teamId === team.id);
      const pauseSeconds = team.shiftPausedTotalSeconds + (paused && team.shiftPausedAt ? Math.max(0, Math.floor((Date.now() - new Date(team.shiftPausedAt).getTime()) / 1000)) : 0);
      const workSeconds = team.shiftStartedAt ? Math.max(0, Math.floor(((team.shiftEndsAt ? new Date(team.shiftEndsAt).getTime() : Date.now()) - new Date(team.shiftStartedAt).getTime()) / 1000) - pauseSeconds) : 0;
      const shift = (action: ShiftAction) => updateShift.mutate({ teamId: team.id, action });
      return <Card key={team.id} className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><UsersRound className="h-5 w-5" /></span><div><h2 className="font-semibold text-slate-950">{team.code}</h2><p className="text-xs text-slate-500">{team.name}</p></div></div><Badge className={`border-0 ring-1 ${teamClasses[team.status]}`}>{teamLabels[team.status]}</Badge></div><dl className="mt-5 grid gap-3 text-sm"><div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-slate-500"><CarFront className="h-4 w-4" />Viatura</dt><dd className="font-medium text-slate-800">{vehiclePrefix ? `${vehiclePrefix} · ${vehicleType}` : "Não vinculada"}</dd></div><div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-slate-500"><Clock3 className="h-4 w-4" />Jornada</dt><dd><Badge variant="secondary" className={state.className}>{state.label}</Badge></dd></div>{team.shiftStartedAt && <><div className="flex justify-between gap-3"><dt className="text-slate-500">Início</dt><dd className="font-medium text-slate-800">{formatDateTime(team.shiftStartedAt)}</dd></div><div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-slate-500"><Coffee className="h-4 w-4" />Pausas</dt><dd className="font-medium text-slate-800">{formatDuration(pauseSeconds)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Tempo líquido</dt><dd className="font-medium text-slate-800">{formatDuration(workSeconds)}</dd></div></>}<div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-slate-500"><MapPin className="h-4 w-4" />Última posição</dt><dd className="font-medium text-slate-800">{team.lastLocationAt ? formatDateTime(team.lastLocationAt) : "Sem localização"}</dd></div></dl>{canManage && <div className="mt-5 border-t border-slate-100 pt-4"><Label className="sr-only">Alterar situação da equipe {team.code}</Label><Select value={team.status} onValueChange={value => updateStatus.mutate({ teamId: team.id, status: value as TeamStatus })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(teamLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>}{mayControl && <div className="mt-3 border-t border-slate-100 pt-4"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Jornada de trabalho</p><div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" disabled={active || updateShift.isPending} onClick={() => shift("start")}><Play className="mr-1.5 h-3.5 w-3.5" />Iniciar</Button><Button variant="outline" size="sm" disabled={!active || paused || updateShift.isPending} onClick={() => shift("pause")}><Pause className="mr-1.5 h-3.5 w-3.5" />Pausar</Button><Button variant="outline" size="sm" disabled={!paused || updateShift.isPending} onClick={() => shift("resume")}><Play className="mr-1.5 h-3.5 w-3.5" />Retomar</Button><Button variant="outline" size="sm" disabled={!active || updateShift.isPending} onClick={() => shift("end")}><Square className="mr-1.5 h-3.5 w-3.5" />Encerrar</Button></div>{updateShift.error && <p role="alert" className="mt-3 text-xs text-rose-700">{updateShift.error.message}</p>}</div>}</CardContent></Card>;
    })}{!teams.isLoading && (teams.data?.length ?? 0) === 0 && <Card className="md:col-span-2 xl:col-span-3"><CardContent className="flex flex-col items-center p-14 text-center"><Radio className="h-7 w-7 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-800">Ainda não há equipes cadastradas</h2><p className="mt-1 max-w-md text-sm text-slate-500">Cadastre as equipes reais antes de iniciar despachos. Nenhum dado demonstrativo é criado automaticamente.</p></CardContent></Card>}</div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Cadastrar equipe</DialogTitle><DialogDescription>Inclua apenas recursos operacionais homologados para a central e associe-os ao escopo organizacional correspondente.</DialogDescription></DialogHeader><form className="grid gap-4 py-2" onSubmit={event => { event.preventDefault(); create.mutate({ code, name, agency, organizationId: organizationId === "none" ? null : Number(organizationId), organizationalUnitId: organizationalUnitId === "none" ? null : Number(organizationalUnitId) }); }}><div className="grid gap-2"><Label htmlFor="team-code">Código</Label><Input id="team-code" value={code} onChange={event => setCode(event.target.value)} placeholder="Ex.: VTR-21" required /></div><div className="grid gap-2"><Label htmlFor="team-name">Nome</Label><Input id="team-name" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Patrulha Centro" required /></div><div className="grid gap-2"><Label htmlFor="team-agency">Órgão</Label><Input id="team-agency" value={agency} onChange={event => setAgency(event.target.value)} placeholder="Ex.: Defesa Civil" required /></div><div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label>Organização</Label><Select value={organizationId} onValueChange={value => { setOrganizationId(value); setOrganizationalUnitId("none"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não definida</SelectItem>{(scopes.data?.organizations ?? []).map(org => <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Unidade</Label><Select value={organizationalUnitId} onValueChange={setOrganizationalUnitId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não definida</SelectItem>{(scopes.data?.units ?? []).filter(unit => organizationId === "none" || unit.organizationId === Number(organizationId)).map(unit => <SelectItem key={unit.id} value={String(unit.id)}>{unit.name}</SelectItem>)}</SelectContent></Select></div></div>{create.error && <p className="text-sm text-rose-700">{create.error.message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button disabled={create.isPending}>Cadastrar</Button></div></form></DialogContent></Dialog>
  </div>;
}

export default function TeamsPage() { return <DashboardLayout><TeamsContent /></DashboardLayout>; }
