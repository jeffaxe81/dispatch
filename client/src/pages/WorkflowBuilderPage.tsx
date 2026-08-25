import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, CircleHelp, CircleStop, ClipboardCheck, Clock3, Copy, Database, Flag, GitBranch, GripVertical, History, Inbox, Link2, ListChecks, MousePointer2, PlayCircle, Plus, RefreshCw, RotateCcw, Save, ShieldCheck, Trash2, Undo2, Redo2, Workflow, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

type NodeType = "trigger.manual" | "trigger.external_data" | "condition.if" | "data.transform" | "occurrence.create" | "dispatch.simulate" | "notification.simulate" | "trail.start" | "trail.end";
type FlowNode = { id: string; type: NodeType; label: string; position: { x: number; y: number }; configuration: Record<string, unknown> };
type FlowEdge = { id: string; source: string; target: string };
type AutomationSettings = { requestedMode: "simulacao" | "producao_protegida"; activationRule: "manual" | "incident.created" | "incident.status_changed" | "integration.alrt_alert"; targetConnection: string; activationStatus: "bloqueada"; requiresApproval: true };
type FlowDefinition = { nodes: FlowNode[]; edges: FlowEdge[]; metadata: { mode: "simulacao"; definitionVersion: 1; automation: AutomationSettings } };

const defaultAutomation = (): AutomationSettings => ({ requestedMode: "simulacao", activationRule: "manual", targetConnection: "nenhuma", activationStatus: "bloqueada", requiresApproval: true });

const palette: Array<{ type: NodeType; label: string; description: string; icon: typeof PlayCircle; tone: string }> = [
  { type: "trigger.manual", label: "Execução manual", description: "Inicia um teste controlado.", icon: PlayCircle, tone: "bg-sky-100 text-sky-700" },
  { type: "trigger.external_data", label: "Receber dados externos", description: "Recebe dados homologados de aplicações parceiras.", icon: Inbox, tone: "bg-fuchsia-100 text-fuchsia-700" },
  { type: "condition.if", label: "Condição / IF", description: "Divide o caminho por uma regra.", icon: GitBranch, tone: "bg-amber-100 text-amber-700" },
  { type: "data.transform", label: "Transformar dados", description: "Mapeia campos de entrada e saída.", icon: Database, tone: "bg-violet-100 text-violet-700" },
  { type: "occurrence.create", label: "Criar ocorrência", description: "Simula a criação de ocorrência.", icon: ClipboardCheck, tone: "bg-rose-100 text-rose-700" },
  { type: "dispatch.simulate", label: "Simular despacho", description: "Não altera equipes ou viaturas reais.", icon: Workflow, tone: "bg-emerald-100 text-emerald-700" },
  { type: "notification.simulate", label: "Notificação simulada", description: "Registra uma saída sem enviá-la.", icon: MousePointer2, tone: "bg-cyan-100 text-cyan-700" },
  { type: "trail.start", label: "Início da trilha", description: "Marca o começo da automação.", icon: Flag, tone: "bg-indigo-100 text-indigo-700" },
  { type: "trail.end", label: "Fim da trilha", description: "Fecha a trilha de execução.", icon: CircleStop, tone: "bg-slate-200 text-slate-700" },
];

function defaultNodeConfiguration(type: NodeType): Record<string, unknown> {
  if (type === "trigger.manual") return { mode: "simulacao", inputLabel: "entrada_manual" };
  if (type === "trigger.external_data") return { mode: "simulacao", sourceApplication: "despacho_alrt", sourceConnection: "despacho-alrt-homologacao", eventType: "alert.received", environment: "homologacao" };
  if (type === "condition.if") return { mode: "simulacao", field: "prioridade", operator: "equals", value: "alta" };
  if (type === "data.transform") return { mode: "simulacao", sourceField: "ocorrencia.codigo", targetField: "referenciaOcorrencia" };
  if (type === "occurrence.create") return { mode: "simulacao", creationMode: "revisao_obrigatoria", category: "{{alert.category}}", priority: "{{alert.priority}}", origin: "integracao", requesterName: "Despacho ALRT", description: "{{alert.description}}", address: "{{alert.address}}", latitude: "{{alert.latitude}}", longitude: "{{alert.longitude}}" };
  if (type === "dispatch.simulate") return { mode: "simulacao", strategy: "manual" };
  if (type === "notification.simulate") return { mode: "simulacao", channel: "painel_interno", messageTemplate: "Notificação de teste para {{ocorrencia.codigo}}" };
  return { mode: "simulacao" };
}

export function NodeConfigurationFields({ node, disabled, onChange }: { node: FlowNode; disabled: boolean; onChange: (configuration: Record<string, unknown>) => void }) {
  const read = (key: string) => typeof node.configuration[key] === "string" ? node.configuration[key] as string : "";
  const set = (key: string, value: string) => onChange({ ...node.configuration, [key]: value, mode: "simulacao" });
  if (node.type === "trigger.manual") return <div className="grid gap-2"><Label htmlFor="config-input-label">Campo de entrada</Label><Input id="config-input-label" value={read("inputLabel")} onChange={event => set("inputLabel", event.target.value)} placeholder="entrada_manual" disabled={disabled} /><p className="text-xs leading-5 text-slate-500">Nome do objeto de entrada usado somente no teste manual.</p></div>;
  if (node.type === "trigger.external_data") return <div className="grid gap-3"><div className="rounded-lg bg-fuchsia-50 p-3 text-xs leading-5 text-fuchsia-950"><strong>Entrada de terceiros protegida.</strong> O nó descreve os dados recebidos de um parceiro homologado. O receptor continua sujeito a API key, HMAC, idempotência e auditoria; este workflow não chama serviços externos nem cria efeitos operacionais automaticamente.</div><div className="grid gap-2"><Label>Aplicação de origem</Label><Select value={read("sourceApplication") || "unset"} onValueChange={value => set("sourceApplication", value === "unset" ? "" : value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Selecione</SelectItem><SelectItem value="despacho_alrt">Despacho ALRT</SelectItem><SelectItem value="aplicacao_parceira">Outra aplicação parceira</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="config-source-connection">Conexão de referência</Label><Input id="config-source-connection" value={read("sourceConnection")} onChange={event => set("sourceConnection", event.target.value)} placeholder="despacho-alrt-homologacao" disabled={disabled} /></div><div className="grid gap-2"><Label htmlFor="config-external-event-type">Tipo de evento</Label><Input id="config-external-event-type" value={read("eventType")} onChange={event => set("eventType", event.target.value)} placeholder="alert.received" disabled={disabled} /></div><div className="grid gap-2"><Label>Ambiente de entrada</Label><Select value={read("environment") || "homologacao"} onValueChange={value => set("environment", value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="homologacao">Homologação</SelectItem></SelectContent></Select></div></div>;
  if (node.type === "condition.if") return <div className="grid gap-3"><div className="grid gap-2"><Label htmlFor="config-condition-field">Campo avaliado</Label><Input id="config-condition-field" value={read("field")} onChange={event => set("field", event.target.value)} placeholder="prioridade" disabled={disabled} /></div><div className="grid gap-2"><Label>Operador</Label><Select value={read("operator") || "unset"} onValueChange={value => set("operator", value === "unset" ? "" : value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Selecione</SelectItem><SelectItem value="equals">É igual a</SelectItem><SelectItem value="contains">Contém</SelectItem><SelectItem value="greater_than">É maior que</SelectItem><SelectItem value="less_than">É menor que</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="config-condition-value">Valor de comparação</Label><Input id="config-condition-value" value={read("value")} onChange={event => set("value", event.target.value)} placeholder="alta" disabled={disabled} /></div></div>;
  if (node.type === "data.transform") return <div className="grid gap-3"><div className="grid gap-2"><Label htmlFor="config-source-field">Campo de origem</Label><Input id="config-source-field" value={read("sourceField")} onChange={event => set("sourceField", event.target.value)} placeholder="ocorrencia.codigo" disabled={disabled} /></div><div className="grid gap-2"><Label htmlFor="config-target-field">Campo de destino</Label><Input id="config-target-field" value={read("targetField")} onChange={event => set("targetField", event.target.value)} placeholder="referenciaOcorrencia" disabled={disabled} /></div></div>;
  if (node.type === "occurrence.create") return <div className="grid gap-3"><div className="rounded-lg bg-sky-50 p-3 text-xs leading-5 text-sky-900"><strong>Mapa de ocorrência revisável.</strong> Quando conectado a dados externos, este nó monta uma prévia; a ocorrência só nasce após a confirmação de um operador autorizado.</div><div className="grid gap-2"><Label>Modo de criação</Label><Select value={read("creationMode") || "revisao_obrigatoria"} onValueChange={value => set("creationMode", value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="revisao_obrigatoria">Exigir revisão antes de criar</SelectItem><SelectItem value="simulacao">Somente simular</SelectItem></SelectContent></Select><p className="text-xs text-slate-500">Use os valores entre chaves para mapear dados do alerta recebido.</p></div><div className="grid gap-2"><Label htmlFor="config-occurrence-category">Categoria</Label><Input id="config-occurrence-category" value={read("category")} onChange={event => set("category", event.target.value)} placeholder="{{alert.category}}" disabled={disabled} /></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Prioridade</Label><Input value={read("priority")} onChange={event => set("priority", event.target.value)} placeholder="{{alert.priority}}" disabled={disabled} /></div><div className="grid gap-2"><Label>Situação inicial</Label><Select value={read("status") || "triagem"} onValueChange={value => set("status", value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="triagem">Triagem</SelectItem><SelectItem value="aguardando_despacho">Aguardando despacho</SelectItem><SelectItem value="despachada">Despachada</SelectItem><SelectItem value="aceita">Aceita</SelectItem><SelectItem value="em_atendimento">Em atendimento</SelectItem></SelectContent></Select></div></div><div className="grid gap-2"><Label>Origem</Label><Select value={read("origin") || "integracao"} onValueChange={value => set("origin", value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="central">Central</SelectItem><SelectItem value="telefone">Telefone</SelectItem><SelectItem value="chat">Chat</SelectItem><SelectItem value="sensor">Sensor</SelectItem><SelectItem value="agente">Agente</SelectItem><SelectItem value="integracao">Integração</SelectItem></SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="config-requester-name">Solicitante</Label><Input id="config-requester-name" value={read("requesterName")} onChange={event => set("requesterName", event.target.value)} placeholder="Despacho ALRT" disabled={disabled} /></div><div className="grid gap-2"><Label htmlFor="config-requester-contact">Contato</Label><Input id="config-requester-contact" value={read("requesterContact")} onChange={event => set("requesterContact", event.target.value)} placeholder="Telefone ou canal" disabled={disabled} /></div></div><div className="grid gap-2"><Label htmlFor="config-occurrence-description">Descrição</Label><Textarea id="config-occurrence-description" value={read("description")} onChange={event => set("description", event.target.value)} placeholder="{{alert.description}}" rows={3} disabled={disabled} /></div><div className="grid gap-2"><Label htmlFor="config-occurrence-address">Endereço</Label><Input id="config-occurrence-address" value={read("address")} onChange={event => set("address", event.target.value)} placeholder="{{alert.address}}" disabled={disabled} /></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="config-latitude">Latitude</Label><Input id="config-latitude" value={read("latitude")} onChange={event => set("latitude", event.target.value)} placeholder="{{alert.latitude}}" disabled={disabled} /></div><div className="grid gap-2"><Label htmlFor="config-longitude">Longitude</Label><Input id="config-longitude" value={read("longitude")} onChange={event => set("longitude", event.target.value)} placeholder="{{alert.longitude}}" disabled={disabled} /></div></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="config-team-id">Equipe (ID)</Label><Input id="config-team-id" value={read("assignedTeamId")} onChange={event => set("assignedTeamId", event.target.value)} placeholder="Opcional" inputMode="numeric" disabled={disabled} /></div><div className="grid gap-2"><Label htmlFor="config-vehicle-id">Viatura (ID)</Label><Input id="config-vehicle-id" value={read("assignedVehicleId")} onChange={event => set("assignedVehicleId", event.target.value)} placeholder="Opcional" inputMode="numeric" disabled={disabled} /></div></div></div>;
  if (node.type === "dispatch.simulate") return <div className="grid gap-2"><Label>Estratégia de despacho</Label><Select value={read("strategy") || "unset"} onValueChange={value => set("strategy", value === "unset" ? "" : value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Selecione</SelectItem><SelectItem value="manual">Escolha manual</SelectItem><SelectItem value="primeira_disponivel">Primeira equipe disponível</SelectItem></SelectContent></Select><p className="text-xs leading-5 text-slate-500">A estratégia é registrada para simulação e não modifica recursos operacionais.</p></div>;
  if (node.type === "notification.simulate") return <div className="grid gap-3"><div className="grid gap-2"><Label>Canal simulado</Label><Select value={read("channel") || "unset"} onValueChange={value => set("channel", value === "unset" ? "" : value)} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Selecione</SelectItem><SelectItem value="painel_interno">Painel interno</SelectItem><SelectItem value="email_simulado">E-mail simulado</SelectItem><SelectItem value="webhook_simulado">Webhook simulado</SelectItem></SelectContent></Select><p className="text-xs text-slate-500">Canal selecionado: {read("channel") || "nenhum"}</p></div><div className="grid gap-2"><Label htmlFor="config-notification-message">Mensagem</Label><Textarea id="config-notification-message" value={read("messageTemplate")} onChange={event => set("messageTemplate", event.target.value)} placeholder="Notificação de teste para {{ocorrencia.codigo}}" rows={3} disabled={disabled} /></div></div>;
  return <div className="rounded-lg bg-indigo-50 p-3 text-xs leading-5 text-indigo-900"><strong>{node.type === "trail.start" ? "Início da trilha." : "Fim da trilha."}</strong> {node.type === "trail.start" ? "Recebe a conexão do gatilho e marca o ponto explícito a partir do qual a trilha é acompanhada." : "Fecha a sequência visual e não aceita conexões de saída."} O marcador será validado antes da publicação.</div>;
}

function emptyDefinition(): FlowDefinition {
  return { nodes: [], edges: [], metadata: { mode: "simulacao", definitionVersion: 1, automation: defaultAutomation() } };
}

function normalizeDefinition(value: unknown): FlowDefinition {
  if (!value || typeof value !== "object") return emptyDefinition();
  const raw = value as { nodes?: unknown; edges?: unknown; metadata?: unknown };
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.flatMap(node => {
    if (!node || typeof node !== "object") return [];
    const candidate = node as Partial<FlowNode>;
    if (typeof candidate.id !== "string" || typeof candidate.type !== "string" || typeof candidate.label !== "string" || !candidate.position || typeof candidate.position.x !== "number" || typeof candidate.position.y !== "number") return [];
    return [{ id: candidate.id, type: candidate.type as NodeType, label: candidate.label, position: candidate.position, configuration: candidate.configuration && typeof candidate.configuration === "object" ? candidate.configuration : {} }];
  }) : [];
  const edges = Array.isArray(raw.edges) ? raw.edges.flatMap(edge => {
    if (!edge || typeof edge !== "object") return [];
    const candidate = edge as Partial<FlowEdge>;
    return typeof candidate.id === "string" && typeof candidate.source === "string" && typeof candidate.target === "string" ? [{ id: candidate.id, source: candidate.source, target: candidate.target }] : [];
  }) : [];
  const rawAutomation = raw.metadata && typeof raw.metadata === "object" && "automation" in raw.metadata ? (raw.metadata as { automation?: unknown }).automation : null;
  const candidate = rawAutomation && typeof rawAutomation === "object" ? rawAutomation as Partial<AutomationSettings> : {};
  const requestedMode = candidate.requestedMode === "producao_protegida" ? "producao_protegida" : "simulacao";
  const activationRule = ["manual", "incident.created", "incident.status_changed", "integration.alrt_alert"].includes(String(candidate.activationRule)) ? candidate.activationRule as AutomationSettings["activationRule"] : "manual";
  return { nodes, edges, metadata: { mode: "simulacao", definitionVersion: 1, automation: { requestedMode, activationRule, targetConnection: typeof candidate.targetConnection === "string" && candidate.targetConnection ? candidate.targetConnection : "nenhuma", activationStatus: "bloqueada", requiresApproval: true } } };
}

function validate(definition: FlowDefinition) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(definition.nodes.map(node => node.id));
  if (!definition.nodes.length) warnings.push("Inclua ao menos um nó para iniciar a composição.");
  const triggers = definition.nodes.filter(node => node.type.startsWith("trigger."));
  if (definition.nodes.length && !triggers.length) warnings.push("Inclua um gatilho para definir a origem do fluxo.");
  definition.edges.forEach(edge => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) errors.push("Há uma conexão apontando para um nó removido.");
    if (edge.source === edge.target) errors.push("Um nó não pode se conectar a si mesmo.");
  });
  const targets = new Set(definition.edges.map(edge => edge.target));
  const sources = new Set(definition.edges.map(edge => edge.source));
  const trailStarts = definition.nodes.filter(node => node.type === "trail.start");
  const trailEnds = definition.nodes.filter(node => node.type === "trail.end");
  const disconnected = definition.nodes.filter(node => !node.type.startsWith("trigger.") && !targets.has(node.id));
  if (disconnected.length) warnings.push("Há nós sem conexão de entrada.");
  if (definition.nodes.length > 1) {
    for (const trigger of triggers) {
      if (targets.has(trigger.id)) errors.push(`O gatilho "${trigger.label}" não pode receber conexões de entrada.`);
      if (!sources.has(trigger.id)) errors.push(`O gatilho "${trigger.label}" precisa iniciar ao menos uma conexão.`);
    }
    for (const node of disconnected) errors.push(`O nó "${node.label}" precisa receber uma conexão de entrada.`);
    if (trailStarts.length || trailEnds.length) {
      if (trailStarts.length !== 1) errors.push("A trilha precisa conter exatamente um marcador de início.");
      if (trailEnds.length !== 1) errors.push("A trilha precisa conter exatamente um marcador de fim.");
      trailStarts.filter(node => !targets.has(node.id)).forEach(node => errors.push(`O marcador de início "${node.label}" precisa receber a conexão do gatilho.`));
      trailEnds.filter(node => !targets.has(node.id)).forEach(node => errors.push(`O marcador de fim "${node.label}" precisa receber uma conexão de entrada.`));
      trailEnds.filter(node => sources.has(node.id)).forEach(node => errors.push(`O marcador de fim "${node.label}" não pode possuir conexões de saída.`));
    }
    const edgesBySource = new Map<string, string[]>();
    definition.edges.forEach(edge => edgesBySource.set(edge.source, [...(edgesBySource.get(edge.source) ?? []), edge.target]));
    const reachable = new Set<string>();
    const queue = triggers.map(node => node.id);
    while (queue.length) {
      const current = queue.shift();
      if (!current || reachable.has(current)) continue;
      reachable.add(current);
      (edgesBySource.get(current) ?? []).forEach(target => queue.push(target));
    }
    definition.nodes.filter(node => !reachable.has(node.id)).forEach(node => errors.push(`O nó "${node.label}" não é alcançável a partir de um gatilho.`));
  }
  if (definition.metadata.automation.requestedMode === "producao_protegida") warnings.push("A automação real está somente preparada e permanece bloqueada até homologação e aprovação operacional.");
  return { errors, warnings };
}

function nodePalette(type: NodeType) {
  return palette.find(item => item.type === type) ?? palette[0];
}

function ExecutionStatus({ status }: { status: string }) {
  const styles: Record<string, string> = { concluida: "bg-emerald-50 text-emerald-800", falha: "bg-rose-50 text-rose-800", dead_letter: "bg-violet-50 text-violet-800", em_execucao: "bg-sky-50 text-sky-800", pendente: "bg-amber-50 text-amber-800", cancelada: "bg-slate-100 text-slate-700" };
  const labels: Record<string, string> = { concluida: "Concluída", falha: "Falha", dead_letter: "Dead-letter", em_execucao: "Em execução", pendente: "Pendente", cancelada: "Cancelada" };
  return <Badge className={`border-0 ${styles[status] ?? styles.pendente}`}>{labels[status] ?? status}</Badge>;
}

function formatDate(value: Date | string | null) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";
}

function BuilderContent({ workflowId }: { workflowId: number }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const workflow = trpc.workflows.get.useQuery({ workflowId }, { retry: false });
  const [definition, setDefinition] = useState<FlowDefinition>(emptyDefinition);
  const [persistedDefinition, setPersistedDefinition] = useState<FlowDefinition>(emptyDefinition);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<string>("");
  const [selectedExecutionId, setSelectedExecutionId] = useState<number | null>(null);
  const [history, setHistory] = useState<FlowDefinition[]>([]);
  const [future, setFuture] = useState<FlowDefinition[]>([]);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number; scale: number } | null>(null);
  const canEdit = access.data?.permissions.includes("workflow.edit") ?? false;
  const canActivate = access.data?.permissions.includes("workflow.activate") ?? false;
  const canExecute = access.data?.permissions.includes("workflow.execute") ?? false;
  const canViewHistory = access.data?.permissions.includes("logs.view") ?? false;
  const latestVersion = workflow.data?.versions[0];
  const validation = useMemo(() => validate(definition), [definition]);
  const selected = definition.nodes.find(node => node.id === selectedNodeId) ?? null;
  const dirty = JSON.stringify(definition) !== JSON.stringify(persistedDefinition);
  const executionHistory = trpc.workflows.executions.useQuery({ workflowId, limit: 12 }, { enabled: canViewHistory, retry: false });
  const executionDetail = trpc.workflows.execution.useQuery({ executionId: selectedExecutionId ?? 1 }, { enabled: canViewHistory && selectedExecutionId !== null, retry: false });

  useEffect(() => {
    if (!latestVersion) return;
    const next = normalizeDefinition(latestVersion.definition);
    setDefinition(next);
    setPersistedDefinition(next);
    setHistory([]);
    setFuture([]);
  }, [latestVersion?.id]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      const current = drag.current;
      setDefinition(previous => ({ ...previous, nodes: previous.nodes.map(node => node.id === current.id ? { ...node, position: { x: Math.max(12, current.originX + (event.clientX - current.startX) / current.scale), y: Math.max(12, current.originY + (event.clientY - current.startY) / current.scale) } } : node) }));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const commit = (next: FlowDefinition) => {
    setHistory(previous => [...previous, definition].slice(-30));
    setDefinition(next);
    setFuture([]);
  };
  const addNode = (item: typeof palette[number], position?: { x: number; y: number }) => {
    const sequence = definition.nodes.length + 1;
    const node: FlowNode = { id: `node-${Date.now()}-${sequence}`, type: item.type, label: item.label, position: position ?? { x: 48 + (sequence % 3) * 215, y: 48 + Math.floor(sequence / 3) * 145 }, configuration: defaultNodeConfiguration(item.type) };
    commit({ ...definition, nodes: [...definition.nodes, node] });
    setSelectedNodeId(node.id);
  };
  const updateSelected = (patch: Partial<FlowNode>) => {
    if (!selected) return;
    commit({ ...definition, nodes: definition.nodes.map(node => node.id === selected.id ? { ...node, ...patch } : node) });
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const duplicate: FlowNode = { ...selected, id: `node-${Date.now()}-copy`, label: `${selected.label} (cópia)`, position: { x: selected.position.x + 32, y: selected.position.y + 32 }, configuration: { ...selected.configuration } };
    commit({ ...definition, nodes: [...definition.nodes, duplicate] });
    setSelectedNodeId(duplicate.id);
  };
  const deleteSelected = () => {
    if (!selected) return;
    commit({ ...definition, nodes: definition.nodes.filter(node => node.id !== selected.id), edges: definition.edges.filter(edge => edge.source !== selected.id && edge.target !== selected.id) });
    setSelectedNodeId(null);
    setTargetNodeId("");
  };
  const connectNodes = () => {
    if (!selected || !targetNodeId || selected.id === targetNodeId) return;
    if (definition.edges.some(edge => edge.source === selected.id && edge.target === targetNodeId)) return toast.info("Essa conexão já existe.");
    commit({ ...definition, edges: [...definition.edges, { id: `edge-${Date.now()}`, source: selected.id, target: targetNodeId }] });
    setTargetNodeId("");
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(current => current.slice(0, -1));
    setFuture(current => [definition, ...current].slice(0, 30));
    setDefinition(previous);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(current => current.slice(1));
    setHistory(current => [...current, definition].slice(-30));
    setDefinition(next);
  };
  const centerNodes = () => {
    if (!definition.nodes.length) return;
    commit({ ...definition, nodes: definition.nodes.map((node, index) => ({ ...node, position: { x: 48 + (index % 3) * 220, y: 56 + Math.floor(index / 3) * 150 } })) });
  };
  const updateAutomation = (patch: Partial<AutomationSettings>) => commit({ ...definition, metadata: { ...definition.metadata, automation: { ...definition.metadata.automation, ...patch, activationStatus: "bloqueada", requiresApproval: true } } });

  const save = trpc.workflows.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.workflows.get.invalidate({ workflowId }), utils.workflows.list.invalidate(), utils.integrations.overview.invalidate()]);
      toast.success("Nova versão do workflow salva em modo de simulação.");
    },
  });
  const setActive = trpc.workflows.setActive.useMutation({
    onSuccess: async (_, input) => {
      await Promise.all([utils.workflows.get.invalidate({ workflowId }), utils.workflows.list.invalidate()]);
      toast.success(input.active ? "Workflow publicado para simulação." : "Workflow desativado.");
    },
  });
  const refreshExecutionHistory = async () => {
    await Promise.all([utils.workflows.get.invalidate({ workflowId }), utils.workflows.list.invalidate(), utils.workflows.executions.invalidate({ workflowId, limit: 12 }), utils.integrations.overview.invalidate()]);
    await executionHistory.refetch();
  };
  const execute = trpc.workflows.execute.useMutation({
    onSuccess: async result => {
      await refreshExecutionHistory();
      setSelectedExecutionId(result.executionId);
      if (result.status === "concluida") toast.success("Execução simulada concluída.", { description: `Execução #${result.executionId}: feedback visual registrado, sem chamadas externas.` });
      else toast.error("Falha controlada registrada.", { description: `Execução #${result.executionId}: use o histórico para reprocessar ou acompanhar o dead-letter.` });
    },
  });
  const retryExecution = trpc.workflows.retryExecution.useMutation({
    onSuccess: async result => {
      await refreshExecutionHistory();
      setSelectedExecutionId(result.executionId);
      toast.success("Tentativa simulada reprocessada.", { description: `Execução #${result.executionId}: nenhuma chamada externa foi realizada.` });
    },
  });
  const saveDefinition = () => {
    if (!workflow.data) return;
    if (validation.errors.length) return toast.error("Corrija os erros de conexão antes de salvar.");
    save.mutate({ workflowId, name: workflow.data.workflow.name, description: workflow.data.workflow.description, definition, changeSummary: "Atualização no editor visual" });
  };
  const publish = () => {
    if (dirty) return toast.info("Salve a versão atual antes de publicar.");
    setActive.mutate({ workflowId, active: !workflow.data?.workflow.active });
  };

  if (workflow.error) {
    return <div className="mx-auto max-w-3xl space-y-4 py-8"><Button variant="outline" onClick={() => navigate("/integracoes/workflows")}><ChevronLeft className="mr-1.5 h-4 w-4" />Voltar para workflows</Button><QueryState loading={false} error={workflow.error} label="editor de workflow" /></div>;
  }

  return <div className="mx-auto max-w-[1600px] space-y-4 pb-8">
    <header className="flex flex-col gap-3 rounded-2xl bg-[radial-gradient(circle_at_84%_0%,rgba(14,165,233,.24),transparent_33%),linear-gradient(112deg,#082f49,#0f766e)] px-5 py-5 text-white shadow-lg shadow-slate-900/10 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0"><button onClick={() => navigate("/integracoes/workflows")} className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.15em] text-cyan-100 hover:opacity-80"><ChevronLeft className="h-3.5 w-3.5" />Meus Workflows</button><h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{workflow.data?.workflow.name ?? "Editor de Workflow"}</h1><p className="mt-1 text-sm text-cyan-50/90">v{workflow.data?.workflow.currentVersion ?? "—"} · Canvas visual em <strong>SIMULAÇÃO / MOCK</strong></p></div>
      <div className="flex flex-wrap gap-2"><Badge className="border border-amber-200/50 bg-amber-50/15 px-3 py-1.5 text-amber-50 hover:bg-amber-50/15">SIMULAÇÃO / MOCK</Badge><Button variant="outline" size="sm" onClick={undo} disabled={!history.length || !canEdit} className="border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Undo2 className="mr-1.5 h-3.5 w-3.5" />Desfazer</Button><Button variant="outline" size="sm" onClick={redo} disabled={!future.length || !canEdit} className="border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Redo2 className="mr-1.5 h-3.5 w-3.5" />Refazer</Button>{canEdit && <Button size="sm" onClick={saveDefinition} disabled={!dirty || save.isPending} className="bg-white text-slate-900 hover:bg-cyan-50"><Save className="mr-1.5 h-3.5 w-3.5" />{save.isPending ? "Salvando..." : "Salvar versão"}</Button>}{canActivate && <Button size="sm" onClick={publish} disabled={setActive.isPending || dirty} className="bg-emerald-500 text-white hover:bg-emerald-600"><Check className="mr-1.5 h-3.5 w-3.5" />{workflow.data?.workflow.active ? "Desativar" : "Publicar"}</Button>}{canExecute && <Button size="sm" onClick={() => execute.mutate({ workflowId, simulateFailure: false })} disabled={!workflow.data?.workflow.active || dirty || execute.isPending} className="bg-sky-500 text-white hover:bg-sky-600"><PlayCircle className="mr-1.5 h-3.5 w-3.5" />{execute.isPending ? "Executando..." : "Executar simulação"}</Button>}{canExecute && <Button size="sm" variant="outline" onClick={() => execute.mutate({ workflowId, simulateFailure: true })} disabled={!workflow.data?.workflow.active || dirty || execute.isPending} className="border-amber-100 bg-amber-50 text-amber-900 hover:bg-amber-100"><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Testar falha</Button>}</div>
    </header>

    <QueryState loading={workflow.isLoading || access.isLoading} error={workflow.error ?? access.error} label="editor de workflow" />
    {save.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><strong>Não foi possível salvar.</strong> {save.error.message}</div>}
    {setActive.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><strong>Validação de publicação.</strong> {setActive.error.message}</div>}
    {execute.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><strong>Não foi possível executar.</strong> {execute.error.message}</div>}

    <section className="grid gap-4 xl:grid-cols-[260px_minmax(520px,1fr)_310px]">
      <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="mb-4"><h2 className="font-semibold text-slate-950">Blocos disponíveis</h2><p className="mt-1 text-xs leading-5 text-slate-500">Adicione ou arraste nós ao canvas. Todos os blocos têm efeito apenas simulado.</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{palette.map(item => { const Icon = item.icon; return <button key={item.type} draggable={canEdit} onDragStart={event => event.dataTransfer.setData("application/axe-workflow-node", item.type)} onClick={() => canEdit ? addNode(item) : toast.error("Você não possui permissão para editar workflows.")} className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"><span className={`rounded-lg p-2 ${item.tone}`}><Icon className="h-4 w-4" /></span><span><strong className="block text-sm text-slate-800">{item.label}</strong><small className="mt-0.5 block leading-4 text-slate-500">{item.description}</small></span></button>; })}</div></CardContent></Card>

      <Card className="border-slate-200 shadow-sm"><CardContent className="p-0"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-sky-700" /><h2 className="font-semibold text-slate-950">Canvas</h2><Badge variant="secondary" className="bg-slate-100 text-[10px] text-slate-600">{definition.nodes.length} nós</Badge><Badge variant="secondary" className="bg-slate-100 text-[10px] text-slate-600">{definition.edges.length} conexões</Badge></div><div className="flex items-center gap-1"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(current => Math.max(.65, Number((current - .1).toFixed(2))))} aria-label="Reduzir zoom">−</Button><span className="min-w-12 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(current => Math.min(1.35, Number((current + .1).toFixed(2))))} aria-label="Aumentar zoom">+</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={centerNodes}>Centralizar</Button></div></div><div className="relative min-h-[580px] overflow-auto bg-[linear-gradient(rgba(148,163,184,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.13)_1px,transparent_1px)] bg-[size:24px_24px]" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const type = event.dataTransfer.getData("application/axe-workflow-node") as NodeType; const item = palette.find(candidate => candidate.type === type); if (!item || !canEdit) return; const bounds = event.currentTarget.getBoundingClientRect(); addNode(item, { x: Math.max(12, (event.clientX - bounds.left) / zoom - 88), y: Math.max(12, (event.clientY - bounds.top) / zoom - 40) }); }} onClick={() => setSelectedNodeId(null)}><div className="absolute inset-0 origin-top-left" style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%`, height: `${100 / zoom}%` }}><svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">{definition.edges.map(edge => { const source = definition.nodes.find(node => node.id === edge.source); const target = definition.nodes.find(node => node.id === edge.target); if (!source || !target) return null; const x1 = source.position.x + 176; const y1 = source.position.y + 42; const x2 = target.position.x; const y2 = target.position.y + 42; return <path key={edge.id} d={`M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`} stroke="#0f766e" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />; })}<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0f766e" /></marker></defs></svg>{definition.nodes.map(node => { const item = nodePalette(node.type); const Icon = item.icon; const selectedStyle = node.id === selectedNodeId ? "ring-2 ring-sky-600 shadow-lg" : "border-slate-200 shadow-sm"; return <button key={node.id} style={{ left: node.position.x, top: node.position.y }} onPointerDown={event => { if (!canEdit) return; event.stopPropagation(); drag.current = { id: node.id, startX: event.clientX, startY: event.clientY, originX: node.position.x, originY: node.position.y, scale: zoom }; }} onClick={event => { event.stopPropagation(); setSelectedNodeId(node.id); }} onKeyDown={event => { if (!canEdit) return; const delta = event.key === "ArrowLeft" ? [-12, 0] : event.key === "ArrowRight" ? [12, 0] : event.key === "ArrowUp" ? [0, -12] : event.key === "ArrowDown" ? [0, 12] : null; if (!delta) return; event.preventDefault(); commit({ ...definition, nodes: definition.nodes.map(current => current.id === node.id ? { ...current, position: { x: Math.max(12, current.position.x + delta[0]), y: Math.max(12, current.position.y + delta[1]) } } : current) }); }} className={`absolute w-44 cursor-grab rounded-xl border bg-white p-3 text-left transition-shadow active:cursor-grabbing ${selectedStyle}`}><span className="flex items-center gap-2"><GripVertical className="h-3.5 w-3.5 text-slate-300" /><span className={`rounded-md p-1.5 ${item.tone}`}><Icon className="h-3.5 w-3.5" /></span><strong className="truncate text-xs text-slate-800">{node.label}</strong></span><small className="mt-2 block truncate font-mono text-[10px] text-slate-400">{node.type}</small></button>; })}{!definition.nodes.length && <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"><span className="rounded-2xl bg-white p-4 shadow-sm"><Workflow className="h-7 w-7 text-sky-700" /></span><h3 className="mt-4 font-semibold text-slate-800">Comece pelo gatilho</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Selecione um bloco no painel lateral para compor o primeiro workflow sem disparar qualquer ação externa.</p></div>}</div></div></CardContent></Card>

      <div className="space-y-4"><Card className="border-indigo-100 bg-indigo-50/60 shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-indigo-700" /><h2 className="font-semibold text-slate-950">Automação real controlada</h2></div><p className="mt-2 text-xs leading-5 text-slate-600">Defina a regra desejada agora. A ativação continua bloqueada até homologação, permissão específica e aprovação operacional.</p><div className="mt-4 grid gap-3"><div className="grid gap-2"><Label>Modo solicitado</Label><Select value={definition.metadata.automation.requestedMode} onValueChange={value => updateAutomation({ requestedMode: value as AutomationSettings["requestedMode"] })} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="simulacao">Somente simulação</SelectItem><SelectItem value="producao_protegida">Produção protegida (pendente)</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Regra de início</Label><Select value={definition.metadata.automation.activationRule} onValueChange={value => updateAutomation({ activationRule: value as AutomationSettings["activationRule"] })} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Execução manual</SelectItem><SelectItem value="incident.created">Ocorrência criada</SelectItem><SelectItem value="incident.status_changed">Mudança de situação</SelectItem><SelectItem value="integration.alrt_alert">Alerta de integração</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="automation-connection">Conexão alvo</Label><Input id="automation-connection" value={definition.metadata.automation.targetConnection} onChange={event => updateAutomation({ targetConnection: event.target.value })} placeholder="Ex.: despacho-alrt-eventos" disabled={!canEdit} /></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Status: bloqueada.</strong> Exige aprovação operacional e uma conexão homologada; nenhuma ocorrência ou chamada externa será criada por este painel.</div></div></CardContent></Card><Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2"><MousePointer2 className="h-4 w-4 text-sky-700" /><h2 className="font-semibold text-slate-950">Configuração</h2></div>{selected ? <div className="mt-4 space-y-4"><div className="grid gap-2"><Label htmlFor="node-label">Nome do nó</Label><Input id="node-label" value={selected.label} onChange={event => updateSelected({ label: event.target.value })} maxLength={120} disabled={!canEdit} /></div><div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><span className="block uppercase tracking-[0.12em] text-slate-400">Tipo</span><strong className="mt-1 block font-mono text-slate-700">{selected.type}</strong></div><NodeConfigurationFields node={selected} disabled={!canEdit} onChange={configuration => updateSelected({ configuration })} /><div className="grid gap-2"><Label>Conectar a</Label><Select value={targetNodeId} onValueChange={setTargetNodeId} disabled={!canEdit || definition.nodes.length < 2}><SelectTrigger><SelectValue placeholder="Selecione um nó" /></SelectTrigger><SelectContent>{definition.nodes.filter(node => node.id !== selected.id).map(node => <SelectItem key={node.id} value={node.id}>{node.label}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" onClick={connectNodes} disabled={!targetNodeId || !canEdit}><Link2 className="mr-1.5 h-3.5 w-3.5" />Criar conexão</Button></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={duplicateSelected} disabled={!canEdit}><Copy className="mr-1.5 h-3.5 w-3.5" />Duplicar</Button><Button size="sm" variant="ghost" onClick={deleteSelected} disabled={!canEdit} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Excluir</Button></div></div> : <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">Selecione um nó no canvas para editar, configurar, duplicar ou conectar.</div>}</CardContent></Card><Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-amber-700" /><h2 className="font-semibold text-slate-950">Validação</h2></div><div className="mt-3 space-y-2">{validation.errors.map(error => <p key={error} className="flex gap-2 rounded-lg bg-rose-50 p-2 text-xs leading-5 text-rose-800"><X className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>)}{validation.warnings.map(warning => <p key={warning} className="flex gap-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</p>)}{!validation.errors.length && !validation.warnings.length && <p className="flex gap-2 rounded-lg bg-emerald-50 p-2 text-xs leading-5 text-emerald-800"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />Estrutura pronta para salvar. A publicação será validada novamente pelo servidor.</p>}</div></CardContent></Card>{definition.edges.length > 0 && <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><h2 className="font-semibold text-slate-950">Conexões</h2><div className="mt-3 space-y-2">{definition.edges.map(edge => <div key={edge.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs"><span className="min-w-0 truncate text-slate-600">{definition.nodes.find(node => node.id === edge.source)?.label} <span className="text-slate-400">→</span> {definition.nodes.find(node => node.id === edge.target)?.label}</span><button onClick={() => commit({ ...definition, edges: definition.edges.filter(current => current.id !== edge.id) })} disabled={!canEdit} className="rounded p-1 text-rose-700 hover:bg-rose-100" aria-label="Remover conexão"><X className="h-3.5 w-3.5" /></button></div>)}</div></CardContent></Card>}</div>
    </section>

    {canViewHistory && <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><History className="h-4 w-4 text-sky-700" /><h2 className="font-semibold text-slate-950">Histórico deste workflow</h2></div><p className="mt-1 text-sm text-slate-500">Execuções simuladas, etapas e logs internos do fluxo atual.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => executionHistory.refetch()} disabled={executionHistory.isFetching}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${executionHistory.isFetching ? "animate-spin" : ""}`} />Atualizar</Button><Button size="sm" variant="outline" onClick={() => navigate("/integracoes/execucoes")}><ListChecks className="mr-1.5 h-3.5 w-3.5" />Fila completa</Button></div></div><div className="mt-4 grid gap-2 lg:grid-cols-2">{(executionHistory.data ?? []).map(({ execution }) => <button key={execution.id} onClick={() => setSelectedExecutionId(execution.id)} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-800">Execução #{execution.id}</strong><ExecutionStatus status={execution.status} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span><Clock3 className="mr-1 inline h-3.5 w-3.5" />{formatDate(execution.createdAt)}</span><span>Tentativa {execution.attempts}/{execution.maxAttempts}</span></div>{execution.errorData && <p className="mt-2 text-xs text-rose-700">{String(execution.errorData.message ?? "Falha controlada")}</p>}</button>)}{!executionHistory.isLoading && !(executionHistory.data ?? []).length && <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 lg:col-span-2">Ainda não há execuções para este workflow. Use <strong>Executar simulação</strong> para gerar o histórico ou <strong>Testar falha</strong> para validar retry e dead-letter.</div>}</div>{executionHistory.error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{executionHistory.error.message}</p>}</CardContent></Card>}

    <Dialog open={selectedExecutionId !== null} onOpenChange={open => !open && setSelectedExecutionId(null)}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Detalhes da execução simulada</DialogTitle><DialogDescription>Etapas, falhas controladas e logs internos do workflow, sem requisições a serviços externos.</DialogDescription></DialogHeader>{executionDetail.isLoading && <p className="py-8 text-center text-sm text-slate-500">Carregando histórico...</p>}{executionDetail.data && <div className="space-y-5 py-2"><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">Execução #{executionDetail.data.execution.id}</strong><ExecutionStatus status={executionDetail.data.execution.status} /><span className="text-xs text-slate-500">Tentativa {executionDetail.data.execution.attempts}/{executionDetail.data.execution.maxAttempts}</span>{canExecute && executionDetail.data.execution.status === "falha" && <Button size="sm" onClick={() => retryExecution.mutate({ executionId: executionDetail.data.execution.id })} disabled={retryExecution.isPending}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reprocessar</Button>}</div><section><h3 className="text-sm font-semibold text-slate-900">Etapas</h3><div className="mt-2 space-y-2">{executionDetail.data.steps.map(step => <div key={step.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-slate-800">{step.nodeType}</span><ExecutionStatus status={step.status} /></div><p className="mt-1 text-xs text-slate-500">{step.nodeId} · {step.durationMs ?? 0} ms</p>{step.outputData && <p className="mt-2 text-xs text-emerald-700">Saída simulada registrada.</p>}{step.errorData && <p className="mt-2 text-xs text-rose-700">{String(step.errorData.message ?? "Falha controlada")}</p>}</div>)}</div></section><section><h3 className="text-sm font-semibold text-slate-900">Logs internos</h3><div className="mt-2 space-y-2">{executionDetail.data.logs.map(log => <div key={log.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><Badge variant="outline" className="text-[10px]">{log.level}</Badge><span className="text-xs text-slate-400">{formatDate(log.createdAt)}</span></div><p className="mt-2 text-sm text-slate-700">{log.message}</p></div>)}</div></section></div>}{executionDetail.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{executionDetail.error.message}</p>}</DialogContent></Dialog>
  </div>;
}

export default function WorkflowBuilderPage() {
  const [, params] = useRoute("/integracoes/workflows/:id");
  const workflowId = Number(params?.id);
  if (!Number.isInteger(workflowId) || workflowId < 1) return <DashboardLayout><div className="mx-auto max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">Identificador de workflow inválido.</div></DashboardLayout>;
  return <DashboardLayout><BuilderContent workflowId={workflowId} /></DashboardLayout>;
}
