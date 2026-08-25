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
import { trpc } from "@/lib/trpc";
import { CarFront, Plus, Wrench } from "lucide-react";
import { useState } from "react";

const vehicleLabels: Record<string, string> = { operacional: "Operacional", manutencao: "Em manutenção", indisponivel: "Indisponível" };
const vehicleClasses: Record<string, string> = { operacional: "bg-emerald-50 text-emerald-800 ring-emerald-200", manutencao: "bg-amber-50 text-amber-800 ring-amber-200", indisponivel: "bg-rose-50 text-rose-800 ring-rose-200" };
type VehicleStatus = "operacional" | "manutencao" | "indisponivel";

function VehiclesContent() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [model, setModel] = useState("");
  const [type, setType] = useState("");
  const [teamId, setTeamId] = useState("none");
  const utils = trpc.useUtils();
  const refresh = useRefreshSettings();
  const vehicles = trpc.vehicles.list.useQuery(undefined, { enabled: user?.operationalRole === "administrador", refetchInterval: refresh.interval || false });
  const teams = trpc.teams.list.useQuery(undefined, { enabled: open });
  const create = trpc.vehicles.create.useMutation({ onSuccess: () => { utils.vehicles.list.invalidate(); setOpen(false); setPrefix(""); setLicensePlate(""); setModel(""); setType(""); setTeamId("none"); } });
  const changeStatus = trpc.vehicles.updateStatus.useMutation({ onSuccess: () => utils.vehicles.list.invalidate() });
  if (user?.operationalRole !== "administrador") return <div className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Módulo restrito</h1><p className="mt-2 text-sm text-slate-500">Somente administradores gerenciam a frota operacional.</p></div>;

  return <div className="mx-auto max-w-[1400px] space-y-5 pb-8"><header className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Gestão de recursos</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Viaturas</h1><p className="mt-1 text-sm text-slate-500">Cadastre e mantenha a situação operacional da frota vinculada às equipes.</p></div><div className="flex flex-wrap items-center gap-2"><RefreshControls compact interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={() => vehicles.refetch()} refreshing={vehicles.isFetching} /><Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Cadastrar viatura</Button></div></header><QueryState loading={vehicles.isLoading} error={vehicles.error} label="viaturas" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(vehicles.data ?? []).map(({ vehicle, teamCode, teamName }) => <Card key={vehicle.id} className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between"><span className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><CarFront className="h-5 w-5" /></span><Badge className={`border-0 ring-1 ${vehicleClasses[vehicle.status]}`}>{vehicleLabels[vehicle.status]}</Badge></div><h2 className="mt-4 text-xl font-semibold text-slate-950">{vehicle.prefix}</h2><p className="mt-1 text-sm text-slate-500">{vehicle.type} · {vehicle.licensePlate}</p><dl className="mt-5 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Modelo</dt><dd className="font-medium text-slate-800">{vehicle.model ?? "Não informado"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Equipe</dt><dd className="font-medium text-slate-800">{teamCode ? `${teamCode} · ${teamName}` : "Sem vínculo"}</dd></div></dl><div className="mt-5 border-t border-slate-100 pt-4"><Label className="sr-only">Situação de {vehicle.prefix}</Label><Select value={vehicle.status} onValueChange={value => changeStatus.mutate({ vehicleId: vehicle.id, status: value as VehicleStatus })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(vehicleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>)}{!vehicles.isLoading && (vehicles.data?.length ?? 0) === 0 && <Card className="md:col-span-2 xl:col-span-3"><CardContent className="flex flex-col items-center p-14 text-center"><Wrench className="h-7 w-7 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-800">Nenhuma viatura cadastrada</h2><p className="mt-1 text-sm text-slate-500">A frota real aparecerá aqui após o cadastro administrativo.</p></CardContent></Card>}</div><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Cadastrar viatura</DialogTitle><DialogDescription>Informe a identificação operacional e associe a viatura a uma equipe, se aplicável.</DialogDescription></DialogHeader><form className="grid gap-4 py-2" onSubmit={event => { event.preventDefault(); create.mutate({ prefix, licensePlate, model: model || undefined, type, teamId: teamId === "none" ? undefined : Number(teamId) }); }}><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="prefix">Prefixo</Label><Input id="prefix" value={prefix} onChange={event => setPrefix(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="plate">Placa</Label><Input id="plate" value={licensePlate} onChange={event => setLicensePlate(event.target.value)} required /></div></div><div className="grid gap-2"><Label htmlFor="vehicle-type">Tipo</Label><Input id="vehicle-type" value={type} onChange={event => setType(event.target.value)} placeholder="Ex.: Caminhonete 4x4" required /></div><div className="grid gap-2"><Label htmlFor="vehicle-model">Modelo</Label><Input id="vehicle-model" value={model} onChange={event => setModel(event.target.value)} /></div><div className="grid gap-2"><Label>Equipe vinculada</Label><Select value={teamId} onValueChange={setTeamId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem vínculo inicial</SelectItem>{(teams.data ?? []).map(row => <SelectItem key={row.team.id} value={String(row.team.id)}>{row.team.code} · {row.team.name}</SelectItem>)}</SelectContent></Select></div>{create.error && <p className="text-sm text-rose-700">{create.error.message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={create.isPending}>Cadastrar</Button></div></form></DialogContent></Dialog></div>;
}

export default function VehiclesPage() { return <DashboardLayout><VehiclesContent /></DashboardLayout>; }
