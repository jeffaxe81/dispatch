export const statusLabels: Record<string, string> = {
  triagem: "Em triagem",
  aguardando_despacho: "Aguardando despacho",
  despachada: "Despachada",
  aceita: "Aceita pela equipe",
  em_atendimento: "Em atendimento",
  pausada: "Atendimento pausado",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const priorityLabels: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const priorityClasses: Record<string, string> = {
  baixa: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  media: "bg-amber-50 text-amber-800 ring-amber-200",
  alta: "bg-orange-50 text-orange-800 ring-orange-200",
  critica: "bg-rose-50 text-rose-800 ring-rose-200",
};

export const statusClasses: Record<string, string> = {
  triagem: "bg-slate-100 text-slate-700 ring-slate-200",
  aguardando_despacho: "bg-amber-50 text-amber-800 ring-amber-200",
  despachada: "bg-blue-50 text-blue-800 ring-blue-200",
  aceita: "bg-violet-50 text-violet-800 ring-violet-200",
  em_atendimento: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  pausada: "bg-orange-50 text-orange-800 ring-orange-200",
  concluida: "bg-slate-100 text-slate-700 ring-slate-200",
  cancelada: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  const minutes = Math.round(seconds / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

