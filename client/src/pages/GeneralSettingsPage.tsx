import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, DatabaseZap, LockKeyhole, MapPinned, Save, Settings2, ShieldCheck } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

type MapForm = {
  centerLatitude: string;
  centerLongitude: string;
  defaultZoom: string;
  mapType: "roadmap" | "satellite" | "terrain" | "hybrid";
  trafficEnabled: boolean;
  autoFitEnabled: boolean;
  fallbackMode: "automatic" | "openstreetmap" | "google_only";
};

const emptyForm: MapForm = { centerLatitude: "-27.0976", centerLongitude: "-48.9104", defaultZoom: "13", mapType: "roadmap", trafficEnabled: false, autoFitEnabled: true, fallbackMode: "automatic" };
const RESET_CONFIRMATION = "ZERAR AXE DISPATCH";
type ResetScope = "operational" | "total";
const resetScopeDetails: Record<ResetScope, { confirmation: string; title: string; description: string; preserved: string }> = {
  operational: { confirmation: "ZERAR DADOS OPERACIONAIS", title: "Dados operacionais e de simulação", description: "Remove ocorrências, despachos, referências de evidências, posições, workflows e registros de integração simulada.", preserved: "Preserva usuários, acessos, equipes, viaturas, configurações e auditoria." },
  total: { confirmation: "ZERAR SOLUÇÃO AXE DISPATCH", title: "Dados totais da solução", description: "Além dos dados operacionais, remove usuários cadastrados, perfis de usuário, vínculos de acesso, equipes e viaturas.", preserved: "Preserva somente a sessão e o perfil do Super Administrador atual, a estrutura técnica, configurações e auditoria." },
};
const mapTypeLabels: Record<MapForm["mapType"], string> = { roadmap: "Mapa padrão", satellite: "Satélite", terrain: "Terreno", hybrid: "Híbrido" };
const fallbackModeLabels: Record<MapForm["fallbackMode"], { title: string; description: string }> = {
  automatic: { title: "OpenStreetMap preferencial (recomendado)", description: "Usa OpenStreetMap como provider padrão. Google Maps permanece disponível somente como opção de transição controlada." },
  openstreetmap: { title: "Somente OpenStreetMap", description: "Mantém o provider open source ativo e não carrega Google Maps." },
  google_only: { title: "Google Maps (transição)", description: "Mantém o provider legado ativo somente para diagnóstico, comparação ou rollback controlado." },
};
const resetImpactLabels: Record<string, string> = {
  occurrences: "Ocorrências",
  assignments: "Despachos",
  evidenceReferences: "Referências de evidências",
  occurrenceEvents: "Eventos de ocorrência",
  teamLocations: "Posições de equipe",
  workflows: "Workflows simulados",
  workflowVersions: "Versões de workflow",
  workflowExecutions: "Execuções simuladas",
  workflowExecutionSteps: "Etapas de execução",
  integrationConnections: "Conexões simuladas",
  integrationCredentials: "Placeholders de credenciais",
  integrationWebhooks: "Webhooks simulados",
  integrationLogs: "Logs de integração",
  importedOpenapiSpecs: "Especificações OpenAPI",
  importedOpenapiOperations: "Operações OpenAPI",
  users: "Usuários cadastrados",
  userProfiles: "Perfis de usuário",
  userRoleAssignments: "Vínculos de acesso",
  teams: "Equipes cadastradas",
  vehicles: "Viaturas cadastradas",
};

function GeneralSettingsContent() {
  const [form, setForm] = useState<MapForm>(emptyForm);
  const [resetScope, setResetScope] = useState<ResetScope>("operational");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [, setLocation] = useLocation();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const canConfigure = Boolean(access.data?.isSuperAdministrator);
  const settings = trpc.settings.generalMap.useQuery(undefined, { enabled: canConfigure, retry: false });
  const futureEntries = trpc.settings.futureEntries.useQuery(undefined, { enabled: canConfigure, retry: false });
  const resetPreview = trpc.settings.resetPreview.useQuery({ scope: resetScope }, { enabled: canConfigure, retry: false });
  const utils = trpc.useUtils();
  const save = trpc.settings.updateGeneralMap.useMutation({
    onSuccess: () => {
      utils.settings.generalMap.invalidate();
      utils.settings.operationalMap.invalidate();
    },
  });
  const reset = trpc.settings.resetOperationalData.useMutation({
    onSuccess: () => {
      setResetOpen(false);
      setResetConfirmation("");
      setResetReason("");
      utils.settings.resetPreview.invalidate();
      utils.dashboard.summary.invalidate();
      utils.incidents.invalidate();
      utils.teams.invalidate();
      utils.workflows.invalidate();
      utils.integrations.invalidate();
      utils.audit.operations.invalidate();
    },
  });

  useEffect(() => {
    if (settings.data) {
      setForm({
        centerLatitude: String(settings.data.centerLatitude),
        centerLongitude: String(settings.data.centerLongitude),
        defaultZoom: String(settings.data.defaultZoom),
        mapType: settings.data.mapType,
        trafficEnabled: settings.data.trafficEnabled,
        autoFitEnabled: settings.data.autoFitEnabled,
        fallbackMode: settings.data.fallbackMode,
      });
    }
  }, [settings.data]);
  useEffect(() => {
    if (!access.isLoading && !access.error && !canConfigure) setLocation("/");
  }, [access.error, access.isLoading, canConfigure, setLocation]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    save.mutate({
      centerLatitude: Number(form.centerLatitude),
      centerLongitude: Number(form.centerLongitude),
      defaultZoom: Number(form.defaultZoom),
      mapType: form.mapType,
      trafficEnabled: form.trafficEnabled,
      autoFitEnabled: form.autoFitEnabled,
      fallbackMode: form.fallbackMode,
    });
  };
  const resetEnabled = resetConfirmation.trim().toUpperCase() === resetScopeDetails[resetScope].confirmation && resetReason.trim().length >= 10;
  const resetImpactRows = useMemo(() => Object.entries(resetPreview.data?.impact ?? {}).filter(([, total]) => Number(total) > 0), [resetPreview.data?.impact]);

  if (access.isLoading) return <QueryState loading label="permissões" />;
  if (access.error) return <QueryState error={access.error} label="permissões" />;
  if (!canConfigure) return <QueryState loading label="redirecionamento seguro" />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">Administração superior</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Configurações gerais</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Parâmetros globais do AXE Dispatch. Alterações são auditadas e passam a orientar o mapa operacional de todos os usuários.</p>
        </div>
        <Badge className="w-fit border-0 bg-violet-50 text-violet-800 ring-1 ring-violet-200"><LockKeyhole className="mr-1.5 h-3.5 w-3.5" />Super Administrador</Badge>
      </header>

      <QueryState loading={settings.isLoading} error={settings.error} label="configurações" />

      <form onSubmit={submit} className="space-y-6">
        <Card className="border-sky-100 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-sky-700" />Mapa operacional</CardTitle>
            <CardDescription>Defina o ponto de abertura, zoom padrão, camadas e o provider do mapa da central de despacho.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2"><Label htmlFor="map-lat">Latitude do centro</Label><Input id="map-lat" type="number" min="-90" max="90" step="0.0001" value={form.centerLatitude} onChange={event => setForm(current => ({ ...current, centerLatitude: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="map-lng">Longitude do centro</Label><Input id="map-lng" type="number" min="-180" max="180" step="0.0001" value={form.centerLongitude} onChange={event => setForm(current => ({ ...current, centerLongitude: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="map-zoom">Zoom padrão</Label><Input id="map-zoom" type="number" min="8" max="20" step="1" value={form.defaultZoom} onChange={event => setForm(current => ({ ...current, defaultZoom: event.target.value }))} required /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2"><Label>Tipo de mapa</Label><Select value={form.mapType} onValueChange={value => setForm(current => ({ ...current, mapType: value as MapForm["mapType"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(mapTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><Label htmlFor="map-traffic">Trânsito</Label><p className="mt-1 text-xs text-slate-500">Exibir camada de tráfego.</p></div><Switch id="map-traffic" checked={form.trafficEnabled} onCheckedChange={value => setForm(current => ({ ...current, trafficEnabled: value }))} /></div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><Label htmlFor="map-fit">Ajuste automático</Label><p className="mt-1 text-xs text-slate-500">Reservado para ajuste por dados.</p></div><Switch id="map-fit" checked={form.autoFitEnabled} onCheckedChange={value => setForm(current => ({ ...current, autoFitEnabled: value }))} /></div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div className="flex-1"><Label htmlFor="map-fallback-mode" className="text-amber-950">Provider de mapa</Label><p className="mt-1 text-xs leading-5 text-amber-900">Escolha o provider cartográfico da central. OpenStreetMap é o padrão recomendado; Google Maps fica disponível apenas durante a transição. Esta definição é global e auditada.</p><Select value={form.fallbackMode} onValueChange={value => setForm(current => ({ ...current, fallbackMode: value as MapForm["fallbackMode"] }))}><SelectTrigger id="map-fallback-mode" className="mt-3 max-w-md border-amber-300 bg-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(fallbackModeLabels).map(([value, entry]) => <SelectItem key={value} value={value}>{entry.title}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs font-medium text-amber-950">{fallbackModeLabels[form.fallbackMode].description}</p></div></div>
            </div>
            <div className="rounded-xl bg-sky-50 p-4 text-sm leading-6 text-sky-900">O centro e o zoom definidos serão aplicados na abertura do mapa operacional. O ajuste automático permanece preparado para a próxima evolução de enquadramento por ocorrências e equipes ativas.</div>
          </CardContent>
        </Card>

        <Card className="border-dashed border-slate-300 bg-slate-50/60">
          <CardContent className="flex gap-3 p-5"><Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /><div><p className="font-medium text-slate-800">Registro extensível de configurações</p><p className="mt-1 text-sm leading-6 text-slate-600">A plataforma mantém um registro persistido de chaves futuras por seção. Há <strong>{futureEntries.data?.length ?? 0}</strong> parâmetro(s) adicional(is) ativo(s) neste momento; próximos módulos poderão usar o mesmo registro sem alterar as opções de mapa.</p></div></CardContent>
        </Card>

        {save.error && <p role="alert" className="text-sm text-rose-700">{save.error.message}</p>}
        <div className="flex justify-end"><Button type="submit" disabled={settings.isLoading || save.isPending}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Salvando..." : "Salvar configurações"}</Button></div>
      </form>

      <Card className="border-rose-200 bg-rose-50/40 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-950"><DatabaseZap className="h-5 w-5 text-rose-700" />Reinicialização operacional controlada</CardTitle>
          <CardDescription className="max-w-3xl text-rose-900">Escolha com precisão o escopo da reinicialização. Toda execução é exclusiva do Super Administrador, exige confirmação textual e não pode ser desfeita pela aplicação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2"><Label htmlFor="reset-scope">Escopo da reinicialização</Label><Select value={resetScope} onValueChange={value => { setResetScope(value as ResetScope); setResetConfirmation(""); }}><SelectTrigger id="reset-scope" className="max-w-xl border-rose-200 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operational">Dados operacionais e de simulação</SelectItem><SelectItem value="total">Dados totais da solução</SelectItem></SelectContent></Select><p className="text-xs leading-5 text-rose-900"><strong>{resetScopeDetails[resetScope].title}:</strong> {resetScopeDetails[resetScope].description} {resetScopeDetails[resetScope].preserved}</p></div>
          <div className="rounded-xl border border-rose-200 bg-white/80 p-4">
            <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" /><div><p className="font-semibold text-rose-950">Prévia de impacto</p><p className="mt-1 text-sm leading-6 text-rose-900">{resetPreview.isLoading ? "Calculando os registros que serão removidos..." : `${resetPreview.data?.totalRecords ?? 0} registro(s) serão removidos nesta operação.`}</p></div></div>
            {resetImpactRows.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{resetImpactRows.map(([key, total]) => <div key={key} className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm"><span className="text-rose-900">{resetImpactLabels[key] ?? key}</span><strong className="text-rose-950">{Number(total)}</strong></div>)}</div>}
            {resetPreview.data && <p className="mt-4 text-xs leading-5 text-rose-800">Preservados: {resetPreview.data.preserved.join(", ")}. {resetPreview.data.evidenceStorageNote}</p>}
          </div>
          {resetPreview.error && <p role="alert" className="text-sm text-rose-700">{resetPreview.error.message}</p>}
          <Button type="button" variant="outline" className="border-rose-300 bg-white text-rose-800 hover:bg-rose-100 hover:text-rose-950" onClick={() => setResetOpen(true)} disabled={resetPreview.isLoading || Boolean(resetPreview.error)}><AlertTriangle className="mr-2 h-4 w-4" />{resetScope === "total" ? "Reinicializar dados totais" : "Reinicializar dados operacionais"}</Button>
        </CardContent>
      </Card>

      <AlertDialog open={resetOpen} onOpenChange={open => { if (!reset.isPending) setResetOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-950"><AlertTriangle className="h-5 w-5 text-rose-700" />Confirmar reinicialização controlada</AlertDialogTitle>
            <AlertDialogDescription>{resetScopeDetails[resetScope].description} {resetScopeDetails[resetScope].preserved} A ação será registrada de forma permanente no Log de operações.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">Digite exatamente <strong className="font-mono">{resetScopeDetails[resetScope].confirmation}</strong> e informe o motivo operacional desta reinicialização.</div>
            <div className="grid gap-2"><Label htmlFor="reset-confirmation">Confirmação textual</Label><Input id="reset-confirmation" value={resetConfirmation} onChange={event => setResetConfirmation(event.target.value)} placeholder={resetScopeDetails[resetScope].confirmation} autoComplete="off" /></div>
            <div className="grid gap-2"><Label htmlFor="reset-reason">Motivo para auditoria</Label><Textarea id="reset-reason" value={resetReason} onChange={event => setResetReason(event.target.value)} placeholder="Ex.: preparação do ambiente para novo ciclo de homologação." maxLength={1000} /></div>
            {reset.error && <p role="alert" className="text-sm text-rose-700">{reset.error.message}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reset.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!resetEnabled || reset.isPending} className="bg-rose-700 text-white hover:bg-rose-800" onClick={event => { event.preventDefault(); if (resetEnabled) reset.mutate({ scope: resetScope, confirmation: resetConfirmation, reason: resetReason }); }}>
              {reset.isPending ? "Reinicializando..." : resetScope === "total" ? "Zerar dados totais previstos" : "Zerar dados operacionais previstos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function GeneralSettingsPage() {
  return <DashboardLayout><GeneralSettingsContent /></DashboardLayout>;
}
