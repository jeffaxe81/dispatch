import { trpc } from "@/lib/trpc";
import { WorkspaceScreenCanvas } from "@/workspace/WorkspaceScreenCanvas";
import type { WorkspaceScreen } from "@shared/workspaceLayout";

export function parseWorkspaceExternalSearch(search: string): { workspace: string; screenId: string } | null {
  const params = new URLSearchParams(search);
  const allowed = new Set(["workspace", "screen"]);
  for (const key of params.keys()) if (!allowed.has(key)) return null;
  const workspace = params.get("workspace")?.trim() ?? "";
  const screenId = params.get("screen")?.trim() ?? "";
  if (!workspace || !screenId) return null;
  if (workspace.length > 80 || screenId.length > 120) return null;
  return { workspace, screenId };
}

export function WorkspaceExternalScreenView({
  state,
  screen,
}: {
  state: "loading" | "ready" | "unavailable" | "unauthorized";
  screen?: WorkspaceScreen;
}) {
  if (state === "loading") {
    return <main className="min-h-screen bg-slate-50 p-6 text-sm text-slate-600">Carregando superfície operacional…</main>;
  }

  if (state === "unauthorized") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-950">Sessão indisponível</h1>
          <p className="mt-2 text-sm text-slate-600">Entre novamente pela tela principal para acessar esta superfície.</p>
          <a className="mt-4 inline-block text-sm font-medium text-sky-700" href="/">Voltar à tela principal</a>
        </section>
      </main>
    );
  }

  if (state === "unavailable" || !screen) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-950">Superfície indisponível</h1>
          <p className="mt-2 text-sm text-slate-600">A configuração solicitada não está disponível para esta sessão.</p>
          <a className="mt-4 inline-block text-sm font-medium text-sky-700" href="/">Voltar à tela principal</a>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5">
      <header className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Superfície externa</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">{screen.name}</h1>
      </header>
      <WorkspaceScreenCanvas screen={screen} />
    </main>
  );
}

export default function WorkspaceExternalScreenPage() {
  const parsed = typeof window === "undefined" ? null : parseWorkspaceExternalSearch(window.location.search);
  const query = trpc.workspace.getOwnScreen.useQuery(
    parsed ? { name: parsed.workspace, screenId: parsed.screenId } : { name: "invalid", screenId: "invalid" },
    { enabled: Boolean(parsed), retry: false },
  );

  if (!parsed) return <WorkspaceExternalScreenView state="unavailable" />;
  if (query.isLoading) return <WorkspaceExternalScreenView state="loading" />;
  if (query.error) {
    const code = query.error.data?.code;
    return <WorkspaceExternalScreenView state={code === "UNAUTHORIZED" ? "unauthorized" : "unavailable"} />;
  }
  if (!query.data) return <WorkspaceExternalScreenView state="unavailable" />;
  return <WorkspaceExternalScreenView state="ready" screen={query.data} />;
}
