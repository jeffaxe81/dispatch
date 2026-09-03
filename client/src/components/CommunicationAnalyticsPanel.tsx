import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock3, MessageSquareMore, Radio, Timer } from "lucide-react";

type Channel = "nao_informado" | "voz" | "chat" | "whatsapp" | "email" | "video" | "outro";
type Status = "iniciada" | "disponivel" | "falhou" | "encerrada";
type FilterValue<T extends string> = T | "all";

type Metrics = {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  activeSessions: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  byChannel: Record<Channel, number>;
};

type Props = {
  metrics: Metrics;
  channel: FilterValue<Channel>;
  status: FilterValue<Status>;
  onChannelChange: (value: FilterValue<Channel>) => void;
  onStatusChange: (value: FilterValue<Status>) => void;
  loading?: boolean;
};

const channelLabels: Record<Channel, string> = {
  nao_informado: "Não informado",
  voz: "Voz",
  chat: "Chat",
  whatsapp: "WhatsApp",
  email: "E-mail",
  video: "Vídeo",
  outro: "Outro",
};

const statusLabels: Record<Status, string> = {
  iniciada: "Iniciada",
  disponivel: "Disponível",
  falhou: "Falhou",
  encerrada: "Encerrada",
};

function duration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Radio }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icon className="h-4 w-4 text-sky-700" />{label}</div><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></div>;
}

export function CommunicationAnalyticsPanel({ metrics, channel, status, onChannelChange, onStatusChange, loading = false }: Props) {
  const distribution = Object.entries(metrics.byChannel)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]) as [Channel, number][];

  return <Card className="border-slate-200 shadow-sm" data-communication-analytics>
    <CardHeader className="gap-4 border-b border-slate-100 lg:flex-row lg:items-end lg:justify-between">
      <div><CardTitle className="text-base">Indicadores de comunicação</CardTitle><CardDescription className="mt-1">Sessões técnicas vinculadas às ocorrências dentro do período e da equipe selecionados.</CardDescription></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">Canal da comunicação<select aria-label="Canal da comunicação" className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800" value={channel} onChange={event => onChannelChange(event.target.value as FilterValue<Channel>)}><option value="all">Todos os canais</option>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">Status da comunicação<select aria-label="Status da comunicação" className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800" value={status} onChange={event => onStatusChange(event.target.value as FilterValue<Status>)}><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </CardHeader>
    <CardContent className={`space-y-5 p-5 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Sessões" value={metrics.totalSessions} icon={MessageSquareMore} />
        <Metric label="Concluídas" value={metrics.completedSessions} icon={CheckCircle2} />
        <Metric label="Falhas" value={metrics.failedSessions} icon={AlertTriangle} />
        <Metric label="Ativas" value={metrics.activeSessions} icon={Radio} />
        <Metric label="Tempo total" value={duration(metrics.totalDurationSeconds)} icon={Clock3} />
        <Metric label="Tempo médio" value={duration(metrics.averageDurationSeconds)} icon={Timer} />
      </div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distribuição por canal</p>{distribution.length ? <div className="mt-3 flex flex-wrap gap-2">{distribution.map(([value, count]) => <span key={value} className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800">{channelLabels[value]} · {count}</span>)}</div> : <p className="mt-3 text-sm text-slate-500">Nenhuma sessão no recorte selecionado.</p>}</div>
      <p className="text-xs text-slate-400">Indicadores calculados apenas sobre metadados técnicos. Conteúdo de conversas, credenciais e dados pessoais não fazem parte desta visão.</p>
    </CardContent>
  </Card>;
}
