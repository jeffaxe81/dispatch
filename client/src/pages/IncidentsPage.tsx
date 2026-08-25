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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { formatDateTime, priorityClasses, priorityLabels, statusClasses, statusLabels } from "@/lib/operational";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, Download, FilterX, MapPin, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

const statuses = ["triagem", "aguardando_despacho", "despachada", "aceita", "em_atendimento", "pausada", "concluida", "cancelada"] as const;
const priorities = ["baixa", "media", "alta", "critica"] as const;
const origins = ["central", "telefone", "chat", "video", "sensor", "agente", "integracao"] as const;

type FormState = {
  category: string;
  priority: (typeof priorities)[number];
  origin: (typeof origins)[number];
  requesterName: string;
  requesterContact: string;
  description: string;
  address: string;
  latitude: string;
  longitude: string;
};

const emptyForm: FormState = { category: "", priority: "media", origin: "central", requesterName: "", requesterContact: "", description: "", address: "", latitude: "", longitude: "" };

function exportCsv(rows: { codigo: string; situacao: string; prioridade: string; tipificacao: string; endereco: string; equipe: string; criadoEm: string }[]) {
  const header = ["Código", "Situação", "Prioridade", "Tipificação", "Endereço", "Equipe", "Criado em"];
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = [header, ...rows.map(row => [row.codigo, row.situacao, row.prioridade, row.tipificacao, row.endereco, row.equipe, row.criadoEm])].map(line => line.map(escape).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ocorrencias-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function IncidentForm({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const utils = trpc.useUtils();
  const create = trpc.incidents.create.useMutation({
    onSuccess: () => {
      utils.incidents.list.invalidate();
      utils.dashboard.summary.invalidate();
      setForm(emptyForm);
      onOpenChange(false);
    },
  });

  const update = (key: keyof FormState, value: string) => setForm(current => ({ ...current, [key]: value }));
  const useLocation = () => {
    navigator.geolocation?.getCurrentPosition(position => {
      update("latitude", position.coords.latitude.toFixed(7));
      update("longitude", position.coords.longitude.toFixed(7));
    });
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    create.mutate({
      category: form.category,
      priority: form.priority,
      origin: form.origin,
      requesterName: form.requesterName || undefined,
      requesterContact: form.requesterContact || undefined,
      description: form.description,
      address: form.address,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Nova ocorrência</DialogTitle><DialogDescription>Registre os dados iniciais para iniciar o atendimento e a auditoria do ciclo de vida.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 py-2">
          <div className="grid gap-2"><Label htmlFor="category">Tipificação</Label><Input id="category" value={form.category} onChange={event => update("category", event.target.value)} placeholder="Ex.: Alagamento de via" required /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Prioridade</Label><Select value={form.priority} onValueChange={value => update("priority", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorities.map(priority => <SelectItem key={priority} value={priority}>{priorityLabels[priority]}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Origem</Label><Select value={form.origin} onValueChange={value => update("origin", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{origins.map(origin => <SelectItem key={origin} value={origin} className="capitalize">{origin}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="requester">Solicitante</Label><Input id="requester" value={form.requesterName} onChange={event => update("requesterName", event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="contact">Contato</Label><Input id="contact" value={form.requesterContact} onChange={event => update("requesterContact", event.target.value)} /></div></div>
          <div className="grid gap-2"><Label htmlFor="address">Local da ocorrência</Label><Input id="address" value={form.address} onChange={event => update("address", event.target.value)} placeholder="Rua, número, bairro e referência" required /></div>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]"><div className="grid gap-2"><Label htmlFor="latitude">Latitude</Label><Input id="latitude" type="number" step="0.0000001" value={form.latitude} onChange={event => update("latitude", event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="longitude">Longitude</Label><Input id="longitude" type="number" step="0.0000001" value={form.longitude} onChange={event => update("longitude", event.target.value)} required /></div><Button type="button" variant="outline" onClick={useLocation} className="self-end"><MapPin className="mr-2 h-4 w-4" />Minha posição</Button></div>
          <div className="grid gap-2"><Label htmlFor="description">Descrição inicial</Label><Textarea id="description" value={form.description} onChange={event => update("description", event.target.value)} placeholder="Descreva o que ocorreu, riscos e informações relevantes." rows={4} required /></div>
          {create.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{create.error.message}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={create.isPending}>{create.isPending ? "Registrando..." : "Criar ocorrência"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IncidentsContent() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const refresh = useRefreshSettings();
  const params = useMemo(() => ({ page, pageSize: 20, search: search || undefined, status: status === "all" ? undefined : status as (typeof statuses)[number], priority: priority === "all" ? undefined : priority as (typeof priorities)[number] }), [page, priority, search, status]);
  const list = trpc.incidents.list.useQuery(params, { refetchInterval: refresh.interval || false });
  const exportQuery = trpc.incidents.export.useQuery({ search: search || undefined, status: status === "all" ? undefined : status as (typeof statuses)[number], priority: priority === "all" ? undefined : priority as (typeof priorities)[number] }, { enabled: false });
  const canCreate = ["operador", "despachador", "supervisor", "administrador"].includes(user?.operationalRole ?? "");
  const canExport = ["despachador", "supervisor", "administrador"].includes(user?.operationalRole ?? "");
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  const clear = () => { setSearch(""); setStatus("all"); setPriority("all"); setPage(1); };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-700">Gestão operacional</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Ocorrências</h1><p className="mt-1 text-sm text-slate-500">Consulte, filtre e acompanhe a fila com atualização automática configurável.</p></div><div className="flex flex-wrap gap-2">{canExport && <Button variant="outline" onClick={() => exportQuery.refetch().then(result => result.data && exportCsv(result.data))}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>}{canCreate && <Button onClick={() => setNewDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova ocorrência</Button>}</div></header>
      <RefreshControls interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={() => list.refetch()} refreshing={list.isFetching} />
      <QueryState loading={list.isLoading} error={list.error} label="ocorrências" />
      <Card className="border-slate-200 shadow-sm"><CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="pl-9" placeholder="Buscar por código, tipificação ou endereço" /></div><Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem>{statuses.map(item => <SelectItem key={item} value={item}>{statusLabels[item]}</SelectItem>)}</SelectContent></Select><Select value={priority} onValueChange={value => { setPriority(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as prioridades</SelectItem>{priorities.map(item => <SelectItem key={item} value={item}>{priorityLabels[item]}</SelectItem>)}</SelectContent></Select><Button variant="ghost" onClick={clear}><FilterX className="mr-2 h-4 w-4" />Limpar</Button></CardContent></Card>
      <Card className="overflow-hidden border-slate-200 shadow-sm"><CardContent className="p-0"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-sm text-slate-500"><span>{list.data?.total ?? 0} registro(s) encontrado(s)</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Atualização automática</span></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3 font-medium">Ocorrência</th><th className="px-4 py-3 font-medium">Prioridade</th><th className="px-4 py-3 font-medium">Situação</th><th className="px-4 py-3 font-medium">Equipe</th><th className="px-4 py-3 font-medium">Criada</th></tr></thead><tbody className="divide-y divide-slate-100">{(list.data?.rows ?? []).map(({ incident, teamCode }) => <tr key={incident.id} onClick={() => navigate(`/ocorrencias/${incident.id}`)} className="cursor-pointer transition-colors hover:bg-slate-50"><td className="px-5 py-4"><div className="font-medium text-slate-950">{incident.category}</div><div className="mt-1 text-xs text-slate-500">{incident.code} · {incident.address}</div></td><td className="px-4 py-4"><Badge className={`border-0 ring-1 ${priorityClasses[incident.priority]}`}>{priorityLabels[incident.priority]}</Badge></td><td className="px-4 py-4"><Badge className={`border-0 ring-1 ${statusClasses[incident.status]}`}>{statusLabels[incident.status]}</Badge></td><td className="px-4 py-4 text-sm text-slate-600">{teamCode ?? "Não atribuída"}</td><td className="px-4 py-4 text-sm text-slate-500">{formatDateTime(incident.createdAt)}</td></tr>)}{!list.isLoading && (list.data?.rows.length ?? 0) === 0 && <tr><td colSpan={5} className="px-5 py-16 text-center text-sm text-slate-500">Nenhuma ocorrência atende aos filtros atuais.</td></tr>}</tbody></table></div><footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><span className="text-sm text-slate-500">Página {page} de {totalPages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button></div></footer></CardContent></Card>
      <IncidentForm open={newDialogOpen} onOpenChange={setNewDialogOpen} />
    </div>
  );
}

export default function IncidentsPage() { return <DashboardLayout><IncidentsContent /></DashboardLayout>; }
