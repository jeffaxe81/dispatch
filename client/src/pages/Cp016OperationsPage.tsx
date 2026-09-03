import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Clock3, ExternalLink, MonitorUp, Pause, Play, Radio, Square, UsersRound } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

export type Cp016ShiftAction = "start" | "pause" | "resume" | "end";

type TeamView = {
  code: string;
  name: string;
  shiftStatus: "not_started" | "open" | "paused" | "closed";
  presenceStatus: "available" | "busy" | "paused" | "offline" | "out_of_shift";
  availableForDispatch: boolean;
  startedAt: Date | null;
  pausedAt: Date | null;
  totalPauseSeconds: number;
};

type EmbeddedIntegrationView = {
  code: string;
  name: string;
  url: string;
  enabled: boolean;
  displayMode: "embedded" | "fullscreen" | "split";
};

const NEO_INTEGRATION: EmbeddedIntegrationView = {
  code: "neo-interact",
  name: "NEO Interact",
  url: "https://gscprj.saas.digitro.cloud/neo/",
  enabled: true,
  displayMode: "split",
};

const shiftLabels = {
  not_started: "Jornada não iniciada",
  open: "Jornada em andamento",
  paused: "Jornada em pausa",
  closed: "Jornada encerrada",
} as const;

const presenceLabels = {
  available: "Disponível para despacho",
  busy: "Ocupada em atendimento",
  paused: "Pausada",
  offline: "Offline",
  out_of_shift: "Fora da jornada",
} as const;

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function deriveShiftStatus(team: { shiftStartedAt: Date | null; shiftPausedAt: Date | null; shiftEndsAt: Date | null }): TeamView["shiftStatus"] {
  if (!team.shiftStartedAt) return "not_started";
  if (team.shiftEndsAt) return "closed";
  if (team.shiftPausedAt) return "paused";
  return "open";
}

function derivePresence(team: { status: string; shiftStartedAt: Date | null; shiftPausedAt: Date | null; shiftEndsAt: Date | null }) {
  const inShift = Boolean(team.shiftStartedAt && !team.shiftEndsAt);
  if (!inShift) return { presenceStatus: "out_of_shift" as const, availableForDispatch: false };
  if (team.shiftPausedAt || team.status === "pausada") return { presenceStatus: "paused" as const, availableForDispatch: false };
  if (team.status === "indisponivel") return { presenceStatus: "offline" as const, availableForDispatch: false };
  if (team.status === "em_atendimento" || team.status === "em_deslocamento") return { presenceStatus: "busy" as const, availableForDispatch: false };
  return { presenceStatus: "available" as const, availableForDispatch: true };
}

export function Cp016OperationsView({
  team,
  integration,
  onShiftAction,
}: {
  team: TeamView | null;
  integration: EmbeddedIntegrationView | null;
  onShiftAction: (action: Cp016ShiftAction) => void;
}) {
  const split = integration?.displayMode === "split";
  const iframeEnabled = Boolean(integration?.enabled && integration.url.startsWith("https://"));

  return (
    <div className="mx-auto max-w-[1900px] space-y-5 pb-8">
      <header className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-700">CP-016 · Operação integrada</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Jornada, despacho e telecom</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Visão operacional responsiva para acompanhar disponibilidade da equipe e utilizar o NEO Interact sem sair do AXE Dispatch.
          </p>
        </div>
        {integration?.enabled && (
          <a href={integration.url} target="_blank" rel="noreferrer">
            <Button variant="outline"><ExternalLink className="mr-2 h-4 w-4" />Abrir NEO em nova janela</Button>
          </a>
        )}
      </header>

      <div className={split ? "grid min-h-[720px] gap-4 xl:grid-cols-[minmax(330px,0.72fr)_minmax(680px,1.7fr)]" : "grid gap-4"}>
        <section className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-5 w-5 text-sky-700" />Equipe operacional</CardTitle>
            </CardHeader>
            <CardContent>
              {team ? (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-lg font-semibold text-slate-950">{team.code}</p><p className="text-sm text-slate-500">{team.name}</p></div>
                    <Badge variant="secondary">{shiftLabels[team.shiftStatus]}</Badge>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm text-slate-600"><Radio className="h-4 w-4" />Presença</span>
                      <Badge variant={team.availableForDispatch ? "default" : "secondary"}>{presenceLabels[team.presenceStatus]}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      <div className="flex justify-between"><span>Início</span><strong className="text-slate-900">{team.startedAt ? team.startedAt.toLocaleString("pt-BR") : "—"}</strong></div>
                      <div className="flex justify-between"><span>Pausas acumuladas</span><strong className="text-slate-900">{formatDuration(team.totalPauseSeconds)}</strong></div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Clock3 className="h-4 w-4" />Controle da jornada</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" disabled={team.shiftStatus === "open" || team.shiftStatus === "paused"} onClick={() => onShiftAction("start")}><Play className="mr-2 h-4 w-4" />Iniciar jornada</Button>
                      <Button variant="outline" disabled={team.shiftStatus !== "open"} onClick={() => onShiftAction("pause")}><Pause className="mr-2 h-4 w-4" />Pausar jornada</Button>
                      <Button variant="outline" disabled={team.shiftStatus !== "paused"} onClick={() => onShiftAction("resume")}><Play className="mr-2 h-4 w-4" />Retomar jornada</Button>
                      <Button variant="outline" disabled={team.shiftStatus === "not_started" || team.shiftStatus === "closed"} onClick={() => onShiftAction("end")}><Square className="mr-2 h-4 w-4" />Encerrar jornada</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center"><UsersRound className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 font-medium text-slate-800">Nenhuma equipe selecionada</p><p className="mt-1 text-sm text-slate-500">Selecione uma equipe operacional para acompanhar a jornada.</p></div>
              )}
            </CardContent>
          </Card>
        </section>

        <Card className="min-h-[620px] overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70 py-3">
            <CardTitle className="flex items-center gap-2 text-base"><MonitorUp className="h-5 w-5 text-sky-700" />{integration?.name ?? "NEO Interact"}</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-57px)] min-h-[620px] p-0">
            {iframeEnabled && integration ? (
              <iframe
                title={integration.name}
                src={integration.url}
                className="h-full min-h-[620px] w-full border-0"
                allow="microphone; clipboard-read; clipboard-write"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <div className="flex min-h-[620px] items-center justify-center p-8 text-center">
                <div className="max-w-md"><MonitorUp className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-4 font-semibold text-slate-900">Integração indisponível</h2><p className="mt-2 text-sm text-slate-500">A integração NEO está desabilitada ou ainda não foi configurada para este perfil.</p></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Cp016OperationsPage() {
  const teams = trpc.teams.list.useQuery();
  const utils = trpc.useUtils();
  const updateShift = trpc.teams.updateShift.useMutation({ onSuccess: () => void utils.teams.list.invalidate() });
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedTeamId !== null || !teams.data?.length) return;
    setSelectedTeamId(teams.data[0].team.id);
  }, [selectedTeamId, teams.data]);

  const selected = useMemo(() => teams.data?.find(item => item.team.id === selectedTeamId)?.team ?? null, [selectedTeamId, teams.data]);
  const teamView = useMemo<TeamView | null>(() => {
    if (!selected) return null;
    const presence = derivePresence(selected);
    return {
      code: selected.code,
      name: selected.name,
      shiftStatus: deriveShiftStatus(selected),
      presenceStatus: presence.presenceStatus,
      availableForDispatch: presence.availableForDispatch,
      startedAt: selected.shiftStartedAt,
      pausedAt: selected.shiftPausedAt,
      totalPauseSeconds: selected.shiftPausedTotalSeconds,
    };
  }, [selected]);

  const performShiftAction = (action: Cp016ShiftAction) => {
    if (!selectedTeamId) return;
    updateShift.mutate({ teamId: selectedTeamId, action });
  };

  return (
    <DashboardLayout>
      <div className="mx-auto mb-4 max-w-[1900px]">
        <div className="flex flex-col gap-2 sm:max-w-md">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipe exibida</span>
          <Select value={selectedTeamId ? String(selectedTeamId) : undefined} onValueChange={value => setSelectedTeamId(Number(value))}>
            <SelectTrigger><SelectValue placeholder={teams.isLoading ? "Carregando equipes..." : "Selecionar equipe"} /></SelectTrigger>
            <SelectContent>{(teams.data ?? []).map(({ team }) => <SelectItem key={team.id} value={String(team.id)}>{team.code} · {team.name}</SelectItem>)}</SelectContent>
          </Select>
          {teams.error && <p role="alert" className="text-sm text-rose-700">{teams.error.message}</p>}
          {updateShift.error && <p role="alert" className="text-sm text-rose-700">{updateShift.error.message}</p>}
        </div>
      </div>
      <Cp016OperationsView team={teamView} integration={NEO_INTEGRATION} onShiftAction={performShiftAction} />
    </DashboardLayout>
  );
}
