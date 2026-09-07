import React from "react";

export type WorkspaceWidgetFrameState = "ready" | "loading" | "empty" | "unavailable" | "forbidden" | "error";

export function WorkspaceWidgetFrame({
  title,
  state = "ready",
  children,
}: {
  title: string;
  state?: WorkspaceWidgetFrameState;
  error?: unknown;
  children?: React.ReactNode;
}) {
  let content: React.ReactNode = children;
  if (state === "loading") content = <p className="text-sm text-slate-600">Carregando…</p>;
  if (state === "empty") content = <p className="text-sm text-slate-600">Nenhum dado disponível.</p>;
  if (state === "unavailable") content = <p className="text-sm text-slate-600">Conteúdo indisponível.</p>;
  if (state === "forbidden") content = <p className="text-sm text-slate-600">Acesso não autorizado.</p>;
  if (state === "error") content = <p className="text-sm text-slate-600">Conteúdo temporariamente indisponível.</p>;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Workspace</div>
      <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-3">{content}</div>
    </section>
  );
}
