import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, CircleDotDashed, Clock3, ListChecks, RefreshCw, RotateCcw, Workflow } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function ExecutionStatus({ status }: { status: string }) {
  const styles: Record<string, string> = { concluida: "bg-emerald-50 text-emerald-800", falha: "bg-rose-50 text-rose-800", dead_letter: "bg-violet-50 text-violet-800", em_execucao: "bg-sky-50 text-sky-800", pendente: "bg-amber-50 text-amber-800", cancelada: "bg-slate-100 text-slate-700" };
  const labels: Record<string, string> = { concluida: "Concluída", falha: "Falha", dead_letter: "Dead-letter", em_execucao: "Em execução", pendente: "Pendente", cancelada: "Cancelada" };
  return <Badge className={`border-0 ${styles[status] ?? styles.pendente}`}>{labels[status] ?? status}</Badge>;
}

function formatDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";
}

function ExecutionsContent() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const executions = trpc.workflows.executions.useQuery(undefined, { retry: false });
  const [selectedExecutionId, setSelectedExecutionId] = useState<number | null>(null);
  const detail = trpc.workflows.execution.useQuery({ executionId: selectedExecutionId ?? 1 }, { enabled: selectedExecutionId !== null, retry: false });
  const canRetry = access.data?.permissions.includes("workflow.execute") ?? false;
  const retry = trpc.workflows.retryExecution.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.workflows.executions.invalidate(), utils.integrations.overview.invalidate()]);
      setSelectedExecutionId(result.executionId);
      toast.success("Execução simulada reprocessada.", { description: "Nenhuma chamada externa foi realizada." });
    },
  });

  const openDetail = (executionId: number) => {
    setSelectedExecutionId(executionId);
    detail.refetch();
  };

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-8">
    <header className="flex flex-col gap-4 rounded-2xl bg-[radial-gradient(circle_at_80%_0%,rgba(14,165,233,.24),transparent_32%),linear-gradient(112deg,#082f49,#0f766e)] px-6 py-7 text-white shadow-lg shadow-slate-900/10 md:flex-row md:items-end md:justify-between">
      <div><button onClick={() => navigate("/integracoes")} className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-100 hover:opacity-80">Integrações &amp; Workflows</button><h1 className="mt-3 text-3xl font-semibold tracking-tight">Execuções simuladas</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-cyan-50/90">Acompanhe a fila persistida, as etapas e os retries controlados. Nenhum item nesta tela realiza chamadas externas.</p></div>
      <div className="flex gap-2"><Badge className="border border-amber-200/50 bg-amber-50/15 px-3 py-1.5 text-amber-50 hover:bg-amber-50/15">SIMULAÇÃO / MOCK</Badge><Button variant="outline" onClick={() => executions.refetch()} disabled={executions.isFetching} className="border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"><RefreshCw className={`mr-2 h-4 w-4 ${executions.isFetching ? "animate-spin" : ""}`} />Atualizar</Button></div>
    </header>

    <QueryState loading={executions.isLoading || access.isLoading} error={executions.error ?? access.error} label="execuções simuladas" />

    <Card className="border-amber-200 bg-amber-50/70 shadow-sm"><CardContent className="flex gap-3 p-4 text-sm text-amber-950"><CircleDotDashed className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><p><strong>Fila persistida e controlada.</strong> O comando manual cria um registro pendente, executa etapas determinísticas e grava o resultado. Falhas intencionais podem ser reprocessadas sem apagar o histórico anterior.</p></CardContent></Card>

    <section className="space-y-3">
      {(executions.data ?? []).map(({ execution, workflowName, initiatorName }) => <Card key={execution.id} className="border-slate-200 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-slate-950">{workflowName}</strong><ExecutionStatus status={execution.status} /><Badge variant="outline" className="border-slate-200 text-[10px] text-slate-600">Tentativa {execution.attempts}/{execution.maxAttempts}</Badge></div><div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-3"><span><Clock3 className="mr-1 inline h-3.5 w-3.5" />{formatDate(execution.createdAt)}</span><span>Responsável: {initiatorName || "Não identificado"}</span><span>Gatilho: {execution.triggerType}</span></div>{execution.errorData && <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />{String(execution.errorData.message ?? "Falha controlada de simulação")}</p>}{execution.status === "dead_letter" && <p className="mt-2 text-xs text-violet-700">Registro preservado na fila dead-letter após esgotar as tentativas; nenhuma nova execução automática será criada.</p>}</div><div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openDetail(execution.id)}><ListChecks className="mr-1.5 h-3.5 w-3.5" />Detalhes</Button>{canRetry && execution.status === "falha" && <Button size="sm" onClick={() => retry.mutate({ executionId: execution.id })} disabled={retry.isPending}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reprocessar</Button>}</div></CardContent></Card>)}
      {!executions.isLoading && !(executions.data ?? []).length && <Card className="border-dashed border-slate-300"><CardContent className="p-10 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Workflow className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-slate-900">Nenhuma execução registrada</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Publique um workflow simulado e use a ação Executar na lista de workflows para gerar o primeiro histórico controlado.</p><Button className="mt-5" variant="outline" onClick={() => navigate("/integracoes/workflows")}>Ir para workflows</Button></CardContent></Card>}
    </section>

    <Dialog open={selectedExecutionId !== null} onOpenChange={open => !open && setSelectedExecutionId(null)}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Detalhes da execução simulada</DialogTitle><DialogDescription>O histórico preserva etapas e logs internos sem payloads de credenciais ou respostas de fornecedores externos.</DialogDescription></DialogHeader>{detail.isLoading && <p className="py-8 text-center text-sm text-slate-500">Carregando detalhes...</p>}{detail.data && <div className="space-y-5 py-2"><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">{detail.data.workflowName}</strong><ExecutionStatus status={detail.data.execution.status} /><span className="text-xs text-slate-500">Execução #{detail.data.execution.id}</span></div><section><h3 className="text-sm font-semibold text-slate-900">Etapas</h3><div className="mt-2 space-y-2">{detail.data.steps.map(step => <div key={step.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-slate-800">{step.nodeType}</span><ExecutionStatus status={step.status} /></div><p className="mt-1 text-xs text-slate-500">{step.nodeId} · {step.durationMs ?? 0} ms</p>{step.errorData && <p className="mt-2 text-xs text-rose-700">{String(step.errorData.message ?? "Falha controlada")}</p>}</div>)}</div></section><section><h3 className="text-sm font-semibold text-slate-900">Logs internos</h3><div className="mt-2 space-y-2">{detail.data.logs.map(log => <div key={log.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><Badge variant="outline" className="text-[10px]">{log.level}</Badge><span className="text-xs text-slate-400">{formatDate(log.createdAt)}</span></div><p className="mt-2 text-sm text-slate-700">{log.message}</p></div>)}</div></section></div>}{detail.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{detail.error.message}</p>}</DialogContent></Dialog>
  </div>;
}

export default function ExecutionsPage() { return <DashboardLayout><ExecutionsContent /></DashboardLayout>; }
