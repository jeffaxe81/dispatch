import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Activity, BookOpenCheck, Braces, Cable, Clock3, FileKey2, FileText, ListChecks, PlugZap, RefreshCw, ShieldCheck, Webhook, Workflow, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
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

const moduleAreas = [
  { label: "Workflows", description: "Desenhe regras operacionais e mantenha versões controladas.", icon: Workflow, phase: "Fase 2", path: "/integracoes/workflows" },
  { label: "Conexões", description: "Registre endpoints de referência com validação HTTPS e proteção anti-SSRF.", icon: PlugZap, phase: "Fase 5", path: "/integracoes/conexoes" },
  { label: "APIs", description: "Organize operações internas e futuras APIs de parceiros.", icon: Braces, phase: "Fase 5" },
  { label: "Webhooks", description: "Prepare contratos de recepção, sem expor endpoints ou receber tráfego externo.", icon: Webhook, phase: "Fase 5", path: "/integracoes/webhooks" },
  { label: "Credenciais", description: "Mantenha placeholders mascarados, sem coletar ou persistir segredos nesta fase.", icon: FileKey2, phase: "Fase 6", path: "/integracoes/credenciais" },
  { label: "Templates", description: "Reutilize modelos de automação orientados ao despacho.", icon: FileText, phase: "Fase 3" },
  { label: "Execuções", description: "Acompanhe cada execução e seus resultados por etapa.", icon: ListChecks, phase: "Fase 4", path: "/integracoes/execucoes" },
  { label: "Logs", description: "Consulte eventos sanitizados e auditáveis do módulo de integrações.", icon: Activity, phase: "Fase 7", path: "/integracoes/logs" },
  { label: "Revisões externas", description: "Confirme prévias recebidas por workflows antes de criar ocorrências.", icon: ClipboardCheck, phase: "Revisão humana", path: "/integracoes/revisoes-externas" },
  { label: "API Docs", description: "Consulte contratos internos e importe especificações para gerar conectores simulados.", icon: BookOpenCheck, phase: "Fases 8–10", path: "/integracoes/api-docs" },
] as const;

function IntegrationsContent() {
  const [, navigate] = useLocation();
  const overview = trpc.integrations.overview.useQuery(undefined, { retry: false });
  const events = trpc.integrations.events.useQuery(undefined, { retry: false });
  const metrics = overview.data?.metrics;

  const notifyUnavailableArea = (label: string, phase: string) => {
    toast.info(`${label} será disponibilizado em ${phase}.`, {
      description: "A fundação atual permanece em modo SIMULAÇÃO / MOCK e não realiza chamadas externas.",
    });
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
      <header className="flex flex-col gap-5 rounded-2xl bg-[radial-gradient(circle_at_80%_0%,rgba(14,165,233,.24),transparent_32%),linear-gradient(112deg,#082f49,#0f766e)] px-6 py-7 text-white shadow-lg shadow-slate-900/10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100"><PlugZap className="h-3.5 w-3.5" /> Camada de orquestração</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Integrações &amp; Workflows</h1>
          <p className="mt-2 text-sm leading-6 text-cyan-50/90">Prepare automações operacionais de forma visual, desacoplada da central de despacho e com controles de acesso por função.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border border-amber-200/50 bg-amber-50/15 px-3 py-1.5 text-amber-50 hover:bg-amber-50/15">SIMULAÇÃO / MOCK</Badge>
          <Button variant="outline" onClick={() => overview.refetch()} disabled={overview.isFetching} className="border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            <RefreshCw className={`mr-2 h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`} />Atualizar painel
          </Button>
        </div>
      </header>

      <QueryState loading={overview.isLoading} error={overview.error} label="painel de integrações" />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Workflows ativos" value={metrics?.activeWorkflows ?? "—"} detail="Ainda não há workflows cadastrados" icon={Workflow} accent="bg-sky-50 text-sky-700" />
        <Metric label="Conexões" value={metrics?.registeredConnections ?? "—"} detail="Nenhum fornecedor conectado" icon={Cable} accent="bg-cyan-50 text-cyan-700" />
        <Metric label="Execuções em 24h" value={metrics?.executionsLast24Hours ?? "—"} detail="Somente testes simulados nesta etapa" icon={Activity} accent="bg-emerald-50 text-emerald-700" />
        <Metric label="Tempo médio" value={metrics?.averageDurationMs === null || metrics?.averageDurationMs === undefined ? "—" : `${metrics.averageDurationMs} ms`} detail="Será calculado após a primeira execução" icon={Clock3} accent="bg-violet-50 text-violet-700" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-950">Estrutura do módulo</h2>
              <p className="mt-1 text-xs text-slate-500">As áreas abaixo estão organizadas para as próximas fases, sem criar operações ou dados simulados como se fossem reais.</p>
            </div>
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
              {moduleAreas.map(area => {
                const Icon = area.icon;
                return (
                  <button key={area.label} onClick={() => ("path" in area && area.path) ? navigate(area.path) : notifyUnavailableArea(area.label, area.phase)} className="group flex min-h-36 items-start gap-3 bg-white p-5 text-left transition-colors hover:bg-sky-50/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600">
                    <span className="rounded-xl bg-slate-100 p-2.5 text-slate-600 transition-colors group-hover:bg-sky-100 group-hover:text-sky-700"><Icon className="h-4.5 w-4.5" /></span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{area.label}</strong><Badge variant="secondary" className="bg-slate-100 text-[10px] font-medium text-slate-600">{area.phase}</Badge></span>
                      <span className="mt-1.5 block text-xs leading-5 text-slate-500">{area.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><ShieldCheck className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-semibold text-amber-950">Ambiente protegido</h2>
                  <p className="mt-1 text-sm leading-6 text-amber-900/80">A primeira entrega está restrita a planejamento e testes internos.</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-xs leading-5 text-amber-950/80">
                <li>Não realiza chamadas para serviços externos.</li>
                <li>Não coleta, exibe ou persiste credenciais.</li>
                <li>As áreas futuras continuam protegidas pelo RBAC do AXE Dispatch.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-sky-700" /><h2 className="font-semibold text-slate-950">Execuções recentes</h2></div>
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center">
                <p className="text-sm font-medium text-slate-700">Acompanhe a fila de simulação</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Consulte etapas, falhas controladas e retries sem disparar fornecedores externos.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/integracoes/execucoes")}>Abrir execuções</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-semibold text-slate-950">Catálogo de eventos internos</h2><p className="mt-1 text-xs text-slate-500">Contratos documentados para o futuro barramento de eventos; nenhum workflow é disparado automaticamente nesta fase.</p></div>
            <Badge variant="outline" className="w-fit border-slate-200 text-slate-600">Planejamento técnico</Badge>
          </div>
          <div className="divide-y divide-slate-100">
            {(events.data ?? []).slice(0, 6).map(event => <div key={event.id} className="flex flex-col gap-3 px-5 py-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><strong className="font-mono text-sm text-slate-800">{event.code}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{event.description}</p></div><div className="flex shrink-0 items-center gap-2"><Badge variant="secondary" className="bg-slate-100 text-[10px] text-slate-600">{event.version}</Badge><Badge className="border-0 bg-slate-100 text-[10px] text-slate-600">{event.active ? "Disponível" : "Planejado"}</Badge></div></div>{event.payloadSchema && <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><summary className="cursor-pointer font-medium text-slate-700">Ver contrato do payload</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-100">{JSON.stringify(event.payloadSchema, null, 2)}</pre></details>}</div>)}
            {!events.isLoading && !(events.data ?? []).length && <div className="px-5 py-8 text-center text-sm text-slate-500">Nenhum contrato de evento foi publicado para este ambiente.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function IntegrationsPage() {
  return <DashboardLayout><IntegrationsContent /></DashboardLayout>;
}
