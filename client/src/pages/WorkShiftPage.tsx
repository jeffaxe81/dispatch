import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Clock3, Coffee, LogIn, LogOut, PlayCircle } from "lucide-react";
import { toast } from "sonner";

type WorkShiftState = "fora_jornada" | "em_jornada" | "em_intervalo" | "encerrada";

type ActionName = "start" | "break" | "resume" | "end";

const STATE_LABELS: Record<WorkShiftState, string> = {
  fora_jornada: "Fora da jornada",
  em_jornada: "Em jornada",
  em_intervalo: "Em intervalo",
  encerrada: "Encerrada",
};

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WorkShiftPage() {
  const utils = trpc.useUtils();
  const current = trpc.workShift.current.useQuery(undefined, { retry: false });
  const start = trpc.workShift.start.useMutation();
  const startBreak = trpc.workShift.break.useMutation();
  const resume = trpc.workShift.resume.useMutation();
  const end = trpc.workShift.end.useMutation();
  const [localError, setLocalError] = useState("");

  const session = current.data;
  const state = (session?.state ?? "fora_jornada") as WorkShiftState;
  const pending = start.isPending || startBreak.isPending || resume.isPending || end.isPending;
  const operationError = localError || current.error?.message || start.error?.message || startBreak.error?.message || resume.error?.message || end.error?.message || "";

  async function runAction(action: ActionName) {
    setLocalError("");
    try {
      if (action === "start") await start.mutateAsync();
      if (action === "break") await startBreak.mutateAsync();
      if (action === "resume") await resume.mutateAsync();
      if (action === "end") await end.mutateAsync();
      await utils.workShift.current.invalidate();
      toast.success("Jornada atualizada com sucesso.");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível atualizar a jornada.");
    }
  }

  return (
    <DashboardLayout>
      <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
        <header className="rounded-2xl bg-[linear-gradient(130deg,#0f172a,#075985)] p-5 text-white shadow-lg shadow-slate-900/10 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-cyan-200">
                <Clock3 className="h-4 w-4" /> Controle operacional
              </div>
              <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Jornada em Tempo Real</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-100">
                Registre sua própria jornada. Usuário e horários são definidos e auditados pelo servidor.
              </p>
            </div>
            <Badge className="border-white/20 bg-white/10 px-3 py-1 text-white hover:bg-white/10">{STATE_LABELS[state]}</Badge>
          </div>
        </header>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-slate-950">Estado atual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Início da jornada</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(session?.startedAt)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Início do intervalo</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(session?.breakStartedAt)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Término</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(session?.endedAt)}</p>
              </div>
            </div>

            {current.isLoading ? <p className="text-sm text-slate-500">Carregando jornada...</p> : null}
            {operationError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{operationError}</p> : null}

            <div className="flex flex-wrap gap-3" aria-label="Ações da jornada">
              {state === "fora_jornada" || state === "encerrada" ? (
                <Button type="button" onClick={() => void runAction("start")} disabled={pending || current.isLoading}>
                  {pending ? <><Clock3 className="mr-2 h-4 w-4" />Processando...</> : <><LogIn className="mr-2 h-4 w-4" />{state === "encerrada" ? "Iniciar nova jornada" : "Iniciar jornada"}</>}
                </Button>
              ) : null}

              {state === "em_jornada" ? (
                <>
                  <Button type="button" variant="outline" onClick={() => void runAction("break")} disabled={pending}>
                    {pending ? <><Clock3 className="mr-2 h-4 w-4" />Processando...</> : <><Coffee className="mr-2 h-4 w-4" />Iniciar intervalo</>}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => void runAction("end")} disabled={pending}>
                    {pending ? <><Clock3 className="mr-2 h-4 w-4" />Processando...</> : <><LogOut className="mr-2 h-4 w-4" />Encerrar jornada</>}
                  </Button>
                </>
              ) : null}

              {state === "em_intervalo" ? (
                <Button type="button" onClick={() => void runAction("resume")} disabled={pending}>
                  {pending ? <><Clock3 className="mr-2 h-4 w-4" />Processando...</> : <><PlayCircle className="mr-2 h-4 w-4" />Retomar jornada</>}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
