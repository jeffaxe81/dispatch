import { AlertCircle, Loader2 } from "lucide-react";
import React from "react";

export function QueryState({ loading, error, label }: { loading?: boolean; error?: { message?: string } | null; label: string }) {
  if (loading) return <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-sky-700" />Carregando {label}...</div>;
  if (error) return <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Não foi possível atualizar {label}. {error.message}</span></div>;
  return null;
}
