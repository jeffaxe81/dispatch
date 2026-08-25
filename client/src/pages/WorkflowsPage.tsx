import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/operational";
import { Archive, CheckCircle2, CirclePause, CopyPlus, ListChecks, Pencil, Play, Plus, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type WorkflowForm = { name: string; description: string };

const initialForm: WorkflowForm = { name: "", description: "" };

function WorkflowStatus({ status, active }: { status: "rascunho" | "publicado" | "arquivado"; active: boolean }) {
  if (status === "arquivado") return <Badge className="border-0 bg-slate-100 text-slate-700"><Archive className="mr-1 h-3 w-3" />Arquivado</Badge>;
  if (active) return <Badge className="border-0 bg-emerald-50 text-emerald-800"><CheckCircle2 className="mr-1 h-3 w-3" />Publicado</Badge>;
  return <Badge className="border-0 bg-amber-50 text-amber-800"><CirclePause className="mr-1 h-3 w-3" />Rascunho</Badge>;
}

function WorkflowsContent() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const workflows = trpc.workflows.list.useQuery(undefined, { retry: false });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<WorkflowForm>(initialForm);
  const [editing, setEditing] = useState<(WorkflowForm & { id: number }) | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const [executionTarget, setExecutionTarget] = useState<{ id: number; name: string } | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const can = (permission: string) => access.data?.permissions.includes(permission) ?? false;
  const refreshWorkflows = async () => {
    await Promise.all([utils.workflows.list.invalidate(), utils.workflows.executions.invalidate(), utils.integrations.overview.invalidate()]);
  };

  const create = trpc.workflows.create.useMutation({
    onSuccess: async () => {
      await refreshWorkflows();
      setCreateOpen(false);
      setCreateForm(initialForm);
      toast.success("Workflow em rascunho criado em modo de simulação.");
    },
  });
  const update = trpc.workflows.update.useMutation({
    onSuccess: async () => {
      await refreshWorkflows();
      setEditing(null);
      toast.success("Nova versão do workflow salva.");
    },
  });
  const setActive = trpc.workflows.setActive.useMutation({
    onSuccess: async (_, input) => {
      await refreshWorkflows();
      toast.success(input.active ? "Workflow publicado para simulação." : "Workflow desativado.");
    },
  });
  const remove = trpc.workflows.delete.useMutation({
    onSuccess: async () => {
      await refreshWorkflows();
      setDeleting(null);
      toast.success("Workflow simulado excluído e ação registrada em auditoria.");
    },
  });
  const execute = trpc.workflows.execute.useMutation({
    onSuccess: async result => {
      await refreshWorkflows();
      setExecutionTarget(null);
      setSimulateFailure(false);
      toast.success("Execução simulada concluída.", { description: `Execução #${result.executionId}: ${result.status}. Nenhuma chamada externa foi realizada.` });
    },
  });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-8">
      <header className="flex flex-col gap-4 rounded-2xl bg-[radial-gradient(circle_at_84%_0%,rgba(14,165,233,.24),transparent_33%),linear-gradient(112deg,#082f49,#0f766e)] px-6 py-7 text-white shadow-lg shadow-slate-900/10 md:flex-row md:items-end md:justify-between">
        <div>
          <button onClick={() => navigate("/integracoes")} className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-100 transition-opacity hover:opacity-80">Integrações &amp; Workflows</button>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Meus Workflows</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-cyan-50/90">Crie, versione e publique automações exclusivamente em <strong>SIMULAÇÃO / MOCK</strong>. Nenhuma ação externa é disparada nesta fase.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate("/integracoes/execucoes")} className="border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ListChecks className="mr-2 h-4 w-4" />Execuções</Button>{can("workflow.create") && <Button onClick={() => setCreateOpen(true)} className="bg-white text-slate-900 hover:bg-cyan-50"><Plus className="mr-2 h-4 w-4" />Novo Workflow</Button>}</div>
      </header>

      <QueryState loading={workflows.isLoading || access.isLoading} error={workflows.error ?? access.error} label="workflows" />

      <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700"><Workflow className="h-4 w-4" /></span><p><strong>Controle de segurança ativo.</strong> Os workflows desta versão são marcados como simulados, começam em rascunho e têm cada criação, alteração, ativação, desativação ou exclusão registrada no Log de operações.</p></div>
          <Badge className="w-fit shrink-0 border border-amber-200 bg-white text-amber-800">SIMULAÇÃO / MOCK</Badge>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {(workflows.data ?? []).map(({ workflow, creatorName }) => (
          <Card key={workflow.id} className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0"><h2 className="truncate font-semibold text-slate-950">{workflow.name}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{workflow.description || "Sem descrição informada."}</p></div>
                <WorkflowStatus status={workflow.status} active={workflow.active} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                <div><span className="block uppercase tracking-[0.1em] text-slate-400">Versão</span><strong className="mt-1 block text-sm text-slate-800">v{workflow.currentVersion}</strong></div>
                <div><span className="block uppercase tracking-[0.1em] text-slate-400">Responsável</span><strong className="mt-1 block truncate text-sm text-slate-800">{creatorName || "Não identificado"}</strong></div>
                <div className="col-span-2"><span className="block uppercase tracking-[0.1em] text-slate-400">Última alteração</span><strong className="mt-1 block text-sm font-medium text-slate-700">{formatDateTime(workflow.updatedAt)}</strong></div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate(`/integracoes/workflows/${workflow.id}`)}><Workflow className="mr-1.5 h-3.5 w-3.5" />Abrir</Button>
                {can("workflow.edit") && <Button size="sm" variant="ghost" onClick={() => setEditing({ id: workflow.id, name: workflow.name, description: workflow.description || "" })}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>}
                {can("workflow.activate") && <Button size="sm" variant="ghost" disabled={setActive.isPending} onClick={() => setActive.mutate({ workflowId: workflow.id, active: !workflow.active })}>{workflow.active ? "Desativar" : "Publicar"}</Button>}
                {can("workflow.execute") && <Button size="sm" variant="ghost" disabled={!workflow.active || execute.isPending} title={workflow.active ? "Executar somente em modo de simulação" : "Publique o workflow antes de executar"} onClick={() => setExecutionTarget({ id: workflow.id, name: workflow.name })}><Play className="mr-1.5 h-3.5 w-3.5" />Executar</Button>}
                {can("workflow.delete") && <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => setDeleting({ id: workflow.id, name: workflow.name })} aria-label={`Excluir ${workflow.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardContent>
          </Card>
        ))}
        {!workflows.isLoading && !(workflows.data ?? []).length && <Card className="border-dashed border-slate-300 lg:col-span-2 xl:col-span-3"><CardContent className="p-10 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><CopyPlus className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-slate-900">Crie o primeiro workflow simulado</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">A criação inicia uma versão v1 em rascunho e não aciona qualquer sistema, serviço ou credencial externa.</p>{can("workflow.create") && <Button className="mt-5" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo Workflow</Button>}</CardContent></Card>}
      </section>

      <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) setCreateForm(initialForm); }}><DialogContent><DialogHeader><DialogTitle>Novo Workflow</DialogTitle><DialogDescription>O workflow será criado em rascunho e com execução exclusivamente simulada.</DialogDescription></DialogHeader><form className="grid gap-4 py-2" onSubmit={event => { event.preventDefault(); create.mutate({ name: createForm.name, description: createForm.description || null }); }}><div className="grid gap-2"><Label htmlFor="workflow-name">Nome</Label><Input id="workflow-name" value={createForm.name} onChange={event => setCreateForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Triagem de ocorrência crítica" minLength={3} maxLength={180} required /></div><div className="grid gap-2"><Label htmlFor="workflow-description">Descrição</Label><Textarea id="workflow-description" value={createForm.description} onChange={event => setCreateForm(current => ({ ...current, description: event.target.value }))} placeholder="Descreva o objetivo operacional do fluxo." rows={4} maxLength={5000} /></div>{create.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{create.error.message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button disabled={create.isPending}>{create.isPending ? "Criando..." : "Criar rascunho"}</Button></div></form></DialogContent></Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Editar Workflow</DialogTitle><DialogDescription>Salvar a alteração cria uma nova versão e preserva a anterior para auditoria.</DialogDescription></DialogHeader><form className="grid gap-4 py-2" onSubmit={event => { event.preventDefault(); if (editing) update.mutate({ workflowId: editing.id, name: editing.name, description: editing.description || null }); }}><div className="grid gap-2"><Label htmlFor="edit-workflow-name">Nome</Label><Input id="edit-workflow-name" value={editing?.name ?? ""} onChange={event => setEditing(current => current ? { ...current, name: event.target.value } : current)} minLength={3} maxLength={180} required /></div><div className="grid gap-2"><Label htmlFor="edit-workflow-description">Descrição</Label><Textarea id="edit-workflow-description" value={editing?.description ?? ""} onChange={event => setEditing(current => current ? { ...current, description: event.target.value } : current)} rows={4} maxLength={5000} /></div>{update.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{update.error.message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button disabled={update.isPending}>{update.isPending ? "Salvando..." : "Salvar nova versão"}</Button></div></form></DialogContent></Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={open => !open && setDeleting(null)}><DialogContent><DialogHeader><DialogTitle>Excluir workflow simulado</DialogTitle><DialogDescription>A exclusão remove o fluxo e suas versões, mas preserva no Log de operações o retrato necessário para auditoria.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900"><strong>Workflow:</strong> {deleting?.name}</div>{remove.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{remove.error.message}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate({ workflowId: deleting.id })}>{remove.isPending ? "Excluindo..." : "Excluir workflow"}</Button></div></div></DialogContent></Dialog>

      <Dialog open={Boolean(executionTarget)} onOpenChange={open => { if (!open) { setExecutionTarget(null); setSimulateFailure(false); } }}><DialogContent><DialogHeader><DialogTitle>Executar workflow simulado</DialogTitle><DialogDescription>O resultado será registrado na fila persistida, mas esta ação nunca chama sistemas externos nem utiliza credenciais.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-950"><strong>Workflow:</strong> {executionTarget?.name}</div><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950"><input type="checkbox" checked={simulateFailure} onChange={event => setSimulateFailure(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-400" /><span><strong>Simular falha controlada</strong><span className="mt-1 block text-xs leading-5 text-amber-900/80">Use somente para validar retry e dead-letter. A falha é interna, identificada no histórico e não interage com fornecedores.</span></span></label>{execute.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{execute.error.message}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setExecutionTarget(null); setSimulateFailure(false); }}>Cancelar</Button><Button disabled={execute.isPending} onClick={() => executionTarget && execute.mutate({ workflowId: executionTarget.id, simulateFailure })}>{execute.isPending ? "Executando..." : simulateFailure ? "Registrar falha controlada" : "Executar simulação"}</Button></div></div></DialogContent></Dialog>
    </div>
  );
}

export default function WorkflowsPage() {
  return <DashboardLayout><WorkflowsContent /></DashboardLayout>;
}
