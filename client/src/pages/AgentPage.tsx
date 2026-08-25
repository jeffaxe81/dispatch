import DashboardLayout from "@/components/DashboardLayout";
import { QueryState } from "@/components/QueryState";
import { RefreshControls } from "@/components/RefreshControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAgentLocation } from "@/hooks/useAgentLocation";
import { useRefreshSettings } from "@/hooks/useRefreshSettings";
import { priorityClasses, priorityLabels, statusClasses, statusLabels } from "@/lib/operational";
import { trpc } from "@/lib/trpc";
import { Check, FileText, ImageIcon, MapPin, Navigation, Paperclip, PauseCircle, PlayCircle, Radio, Upload, X } from "lucide-react";
import React, { useRef, useState } from "react";

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE_FILES = 10;
const ACCEPTED_EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
type EvidenceContentType = typeof ACCEPTED_EVIDENCE_TYPES[number];
type BatchResult = { fileName: string; status: "sent" | "failed"; message: string };

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

function EvidencePanel({ incidentId, preview = false }: { incidentId: number; preview?: boolean }) {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>(() => preview ? [new File([""], "foto-frontal.jpg", { type: "image/jpeg" }), new File([""], "relatorio-atendimento.pdf", { type: "application/pdf" })] : []);
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const evidence = trpc.incidents.evidence.list.useQuery({ incidentId }, { retry: false, enabled: !preview });
  const upload = trpc.incidents.evidence.upload.useMutation();

  const selectFiles = (candidates: FileList | null) => {
    const errors: string[] = [];
    const next = [...files];
    for (const candidate of Array.from(candidates ?? [])) {
      if (!ACCEPTED_EVIDENCE_TYPES.includes(candidate.type as EvidenceContentType)) { errors.push(`${candidate.name}: formato não permitido.`); continue; }
      if (candidate.size > MAX_EVIDENCE_BYTES) { errors.push(`${candidate.name}: excede 8 MB.`); continue; }
      if (next.length >= MAX_EVIDENCE_FILES) { errors.push(`O lote aceita no máximo ${MAX_EVIDENCE_FILES} arquivos.`); break; }
      if (!next.some(file => file.name === candidate.name && file.size === candidate.size && file.lastModified === candidate.lastModified)) next.push(candidate);
    }
    setFiles(next);
    setValidationError(errors.join(" "));
    setUploadError("");
    setResults([]);
  };

  const send = async () => {
    if (preview) { setValidationError("A visualização de desenvolvimento não realiza uploads."); return; }
    if (!files.length) {
      setValidationError("Selecione ao menos um arquivo antes de enviar.");
      return;
    }
    setValidationError("");
    setUploadError("");
    setResults([]);
    setProgress({ completed: 0, total: files.length });
    const failed: File[] = [];
    const errors: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        await upload.mutateAsync({ incidentId, fileName: file.name, contentType: file.type as EvidenceContentType, description: description.trim() || null, dataBase64: await readFileAsBase64(file) });
        setResults(current => [...current, { fileName: file.name, status: "sent", message: "Enviado e auditado." }]);
      } catch (error) {
        failed.push(file);
        const message = error instanceof Error ? error.message : "Falha no envio.";
        errors.push(`${file.name}: ${message}`);
        setResults(current => [...current, { fileName: file.name, status: "failed", message }]);
      } finally {
        setProgress({ completed: index + 1, total: files.length });
      }
    }
    setFiles(failed);
    setUploadError(errors.join(" "));
    if (!failed.length) { setDescription(""); if (inputRef.current) inputRef.current.value = ""; }
    await Promise.all([utils.incidents.evidence.list.invalidate({ incidentId }), utils.incidents.timeline.invalidate({ incidentId })]);
    setProgress(null);
  };

  return <section className="mt-5 border-t border-slate-100 pt-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Paperclip className="h-4 w-4 text-sky-700" />Evidências e anexos</h3><p className="mt-1 text-xs leading-5 text-slate-500">Adicione até {MAX_EVIDENCE_FILES} fotos ou documentos por lote. JPEG, PNG, WEBP ou PDF, até 8 MB por arquivo.</p></div>
      <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" />Selecionar arquivos</Button>
    </div>
    <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" aria-label="Selecionar fotos ou documentos de evidência" onChange={event => selectFiles(event.target.files)} />
    {!!files.length && <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 p-3">
      <p className="text-xs font-medium text-sky-900">{files.length} de {MAX_EVIDENCE_FILES} arquivo(s) pronto(s) para envio</p>
      <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{files.map(file => <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 text-sm text-slate-800">{file.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0 text-sky-700" /> : <FileText className="h-4 w-4 shrink-0 text-sky-700" />}<span className="min-w-0 flex-1 truncate font-medium">{file.name}</span><span className="shrink-0 text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" className="text-xs font-medium text-rose-700" onClick={() => setFiles(current => current.filter(item => item !== file))}>Remover</button></div>)}</div>
      <Textarea className="mt-3 bg-white" value={description} onChange={event => setDescription(event.target.value)} maxLength={1000} rows={2} placeholder="Descrição opcional da evidência" />
      <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{progress ? `Enviando ${progress.completed} de ${progress.total}` : "Cada anexo será auditado separadamente."}</span><Button type="button" size="sm" onClick={send} disabled={Boolean(progress)}>{progress ? "Enviando lote..." : `Enviar ${files.length} arquivo(s)`}</Button></div>
    </div>}
    {(validationError || uploadError || upload.error) && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{validationError || uploadError || upload.error?.message}</p>}
    {!!results.length && <div className="mt-3 space-y-1.5" aria-live="polite">{results.map(result => <div key={`${result.fileName}-${result.status}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${result.status === "sent" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}><span className="font-semibold">{result.status === "sent" ? "Enviado" : "Falhou"}</span><span className="min-w-0 flex-1 truncate">{result.fileName} — {result.message}</span></div>)}</div>}
    <div className="mt-4 space-y-2">
      {evidence.isLoading && <p className="text-xs text-slate-500">Carregando evidências...</p>}
      {(evidence.data ?? []).map(item => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{item.contentType.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{item.fileName}</span><span className="block truncate text-xs text-slate-500">{item.description || "Sem descrição"} • {new Date(item.createdAt).toLocaleString("pt-BR")}</span></span></a>)}
      {!evidence.isLoading && !(evidence.data ?? []).length && <p className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">Nenhuma evidência adicionada neste atendimento.</p>}
    </div>
  </section>;
}

function AgentContent() {
  const { user } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();
  const refresh = useRefreshSettings();
  const access = trpc.access.me.useQuery(undefined, { retry: false });
  const assignments = trpc.incidents.list.useQuery({ page: 1, pageSize: 50 }, { refetchInterval: refresh.interval || false, enabled: user?.operationalRole === "agente" });
  const respond = trpc.incidents.respondToAssignment.useMutation({ onSuccess: () => { utils.incidents.list.invalidate(); utils.dashboard.summary.invalidate(); } });
  const transition = trpc.incidents.transition.useMutation({ onSuccess: () => { utils.incidents.list.invalidate(); utils.dashboard.summary.invalidate(); setNote(""); } });
  const rows = assignments.data?.rows ?? [];
  const active = rows.find(({ incident }) => ["aceita", "em_atendimento", "pausada"].includes(incident.status))?.incident;
  const location = useAgentLocation(user?.teamId, Boolean(sharing && active));

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "evidence") return <div className="mx-auto max-w-2xl space-y-4 pb-8 sm:pt-3"><header className="rounded-2xl bg-[linear-gradient(130deg,#0f172a,#075985)] p-5 text-white shadow-lg shadow-slate-900/10"><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.15em] text-cyan-200"><Radio className="h-3.5 w-3.5" />Visualização de desenvolvimento</div><h1 className="mt-3 text-2xl font-semibold">Evidências e anexos</h1><p className="mt-1 text-sm text-sky-100">Prévia visual sem dados persistidos, upload ou alteração da sessão.</p></header><Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-xs font-medium text-slate-500">OCO-VISUAL</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Atendimento em campo</h2><p className="mt-3 text-sm leading-6 text-slate-600">Painel de evidências apresentado no atendimento ativo de um agente.</p><EvidencePanel incidentId={0} preview /></CardContent></Card></div>;

  const missingFieldPermissions = ["occurrences.view", "occurrences.transition"].filter(permission => !(access.data?.permissions ?? []).includes(permission));
  if (!user?.active) return <div className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Acesso operacional inativo</h1><p className="mt-2 text-sm text-slate-500">A conta está inativa e não pode usar o Aplicativo Agente. Solicite a ativação ao administrador.</p></div>;
  if (user.operationalRole !== "agente") return <div className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Perfil de campo não selecionado</h1><p className="mt-2 text-sm text-slate-500">Seu perfil operacional atual é <strong>{user.operationalRole}</strong>. O acesso ao Aplicativo Agente exige o perfil <strong>Agente de Campo</strong>, vinculado a uma equipe.</p></div>;
  if (!user.teamId) return <div className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Agente de Campo sem equipe</h1><p className="mt-2 text-sm text-slate-500">O perfil está correto, mas nenhuma equipe foi vinculada. Solicite ao administrador que salve o perfil Agente de Campo junto com uma equipe.</p></div>;
  if (!access.isLoading && missingFieldPermissions.length) return <div className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Permissões de campo incompletas</h1><p className="mt-2 text-sm text-slate-500">Seu vínculo não possui as permissões necessárias: <strong>{missingFieldPermissions.join(", ")}</strong>. Solicite ao administrador o perfil dinâmico Agente de Campo no escopo da sua equipe.</p></div>;

  return <div className="mx-auto max-w-2xl space-y-4 pb-8 sm:pt-3">
    <header className="rounded-2xl bg-[linear-gradient(130deg,#0f172a,#075985)] p-5 text-white shadow-lg shadow-slate-900/10"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.15em] text-cyan-200"><Radio className="h-3.5 w-3.5" />Canal de campo</div><h1 className="mt-3 text-2xl font-semibold">Minha operação</h1><p className="mt-1 text-sm text-sky-100">Receba despachos, atualize o atendimento e compartilhe localização quando autorizado.</p></div><RefreshControls compact interval={refresh.interval} onIntervalChange={refresh.setInterval} onRefresh={() => assignments.refetch()} refreshing={assignments.isFetching} className="[&_button]:border-white/30 [&_button]:bg-white/10 [&_button]:text-white [&_button:hover]:bg-white/20 [&_[data-slot=select-trigger]]:border-white/30 [&_[data-slot=select-trigger]]:bg-white/10 [&_[data-slot=select-trigger]]:text-white" /></div></header>
    <QueryState loading={assignments.isLoading} error={assignments.error} label="despachos" />
    {active && <Card className="border-sky-200 bg-sky-50/60 shadow-sm"><CardContent className="flex items-start gap-3 p-4"><Navigation className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-slate-950">Compartilhar localização</p><p className="mt-1 text-xs leading-5 text-slate-600">A posição será atualizada pelo navegador enquanto este aplicativo estiver aberto e o compartilhamento permanecer ligado.</p></div><Switch checked={sharing} onCheckedChange={setSharing} aria-label="Ativar compartilhamento de localização" /></div>{sharing && <p className={`mt-3 text-xs ${location.state === "error" ? "text-rose-700" : "text-sky-700"}`}>{location.state === "requesting" ? "Solicitando permissão do dispositivo..." : location.message || "Aguardando posição."}</p>}</div></CardContent></Card>}
    <section className="space-y-3">{rows.map(({ incident }) => <Card key={incident.id} className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{incident.code}</p><h2 className="mt-1 text-lg font-semibold text-slate-950">{incident.category}</h2></div><div className="flex gap-1"><Badge className={`border-0 ring-1 ${priorityClasses[incident.priority]}`}>{priorityLabels[incident.priority]}</Badge><Badge className={`border-0 ring-1 ${statusClasses[incident.status]}`}>{statusLabels[incident.status]}</Badge></div></div><p className="mt-4 flex items-start gap-2 text-sm text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />{incident.address}</p><p className="mt-3 text-sm leading-6 text-slate-600">{incident.description}</p>{incident.status === "despachada" && <div className="mt-5 grid gap-2 sm:grid-cols-2"><Button disabled={respond.isPending} onClick={() => respond.mutate({ incidentId: incident.id, accepted: true })} className="bg-emerald-700 hover:bg-emerald-800"><Check className="mr-2 h-4 w-4" />Aceitar despacho</Button><Button disabled={respond.isPending} variant="outline" onClick={() => respond.mutate({ incidentId: incident.id, accepted: false, note: "Recusado pelo agente de campo." })} className="border-rose-200 text-rose-700 hover:bg-rose-50"><X className="mr-2 h-4 w-4" />Recusar</Button></div>}{["aceita", "em_atendimento", "pausada"].includes(incident.status) && <div className="mt-5 space-y-3 border-t border-slate-100 pt-4"><Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Atualização operacional (obrigatória para alterar a situação)" rows={2} /><div className="grid gap-2 sm:grid-cols-3">{incident.status === "aceita" && <Button disabled={note.trim().length < 3 || transition.isPending} onClick={() => transition.mutate({ incidentId: incident.id, nextStatus: "em_atendimento", note })}><PlayCircle className="mr-2 h-4 w-4" />Iniciar</Button>}{incident.status === "em_atendimento" && <><Button variant="outline" disabled={note.trim().length < 3 || transition.isPending} onClick={() => transition.mutate({ incidentId: incident.id, nextStatus: "pausada", note })}><PauseCircle className="mr-2 h-4 w-4" />Pausar</Button><Button disabled={note.trim().length < 3 || transition.isPending} onClick={() => transition.mutate({ incidentId: incident.id, nextStatus: "concluida", note })}><Check className="mr-2 h-4 w-4" />Concluir</Button></>}{incident.status === "pausada" && <Button disabled={note.trim().length < 3 || transition.isPending} onClick={() => transition.mutate({ incidentId: incident.id, nextStatus: "em_atendimento", note })}><PlayCircle className="mr-2 h-4 w-4" />Retomar</Button>}</div>{transition.error && <p className="text-sm text-rose-700">{transition.error.message}</p>}</div>}{["aceita", "em_atendimento", "pausada"].includes(incident.status) && <EvidencePanel incidentId={incident.id} />}</CardContent></Card>)}{!assignments.isLoading && rows.length === 0 && <Card><CardContent className="p-12 text-center"><Radio className="mx-auto h-7 w-7 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-800">Nenhum despacho para a sua equipe</h2><p className="mt-1 text-sm text-slate-500">As novas atribuições aparecerão automaticamente nesta tela.</p></CardContent></Card>}</section>
  </div>;
}

export default function AgentPage() { return <DashboardLayout><AgentContent /></DashboardLayout>; }
