import React, { useMemo, useState } from "react";
import EmbeddedApplicationFrame from "@/components/EmbeddedApplicationFrame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Columns3, ExternalLink, LayoutPanelTop, MapPin, Maximize2, MonitorSmartphone, ShieldCheck, UserRound } from "lucide-react";
import type { EmbeddedApplication } from "@shared/embeddedApplications";

export type NeoWorkspaceIncident = {
  code: string;
  category: string;
  priorityLabel: string;
  statusLabel: string;
  address: string;
  requesterName: string | null;
  requesterContact: string | null;
  description: string;
};

type NeoWorkspaceLayout = "split" | "communication" | "dock";

export function NeoOperationalWorkspace({
  open,
  onOpenChange,
  application,
  incident,
  teamCode,
  vehiclePrefix,
  onCommunicationLifecycle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: EmbeddedApplication | null;
  incident: NeoWorkspaceIncident;
  teamCode?: string | null;
  vehiclePrefix?: string | null;
  onCommunicationLifecycle?: (event: "ready" | "timeout" | "error") => void;
}) {
  const [layout, setLayout] = useState<NeoWorkspaceLayout>("split");

  const layoutClasses = useMemo(() => {
    if (layout === "communication") {
      return "grid min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-50 lg:grid-cols-[minmax(280px,0.44fr)_minmax(0,1.56fr)] lg:overflow-hidden";
    }

    if (layout === "dock") {
      return "grid min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-50 lg:grid-rows-[minmax(260px,0.72fr)_minmax(360px,1.28fr)] lg:overflow-hidden";
    }

    return "grid min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-50 lg:grid-cols-[minmax(340px,0.72fr)_minmax(0,1.28fr)] lg:overflow-hidden";
  }, [layout]);

  const contextPanel = (
    <aside
      className={
        layout === "dock"
          ? "min-w-0 space-y-4 border-b border-slate-200 p-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0 lg:overflow-y-auto"
          : "min-w-0 space-y-4 border-b border-slate-200 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r"
      }
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">
          Ocorrência em atendimento
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">{incident.category}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{incident.priorityLabel}</Badge>
          <Badge variant="secondary">{incident.statusLabel}</Badge>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {incident.description}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Local</p>
            <p className="mt-1 text-sm leading-5 text-slate-800">{incident.address}</p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Solicitante</p>
            <p className="mt-1 text-sm text-slate-800">{incident.requesterName ?? "Não informado"}</p>
            <p className="mt-1 text-xs text-slate-500">{incident.requesterContact ?? "Sem contato cadastrado"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <h3 className="font-semibold text-slate-950">Despacho atual</h3>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Equipe</dt>
            <dd className="font-medium text-slate-800">{teamCode ?? "Não atribuída"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Viatura</dt>
            <dd className="font-medium text-slate-800">{vehiclePrefix ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className={layout === "dock" ? "rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950 lg:col-span-3" : "rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"}>
        <strong>Separação de contexto:</strong> nesta fase, nenhum dado da ocorrência é enviado automaticamente ao iframe. O NEO recebe apenas a mensagem técnica de inicialização prevista no contrato.
      </section>
    </aside>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] min-w-0 flex-col overflow-hidden p-0" style={{ width: "min(96vw, 1700px)", maxWidth: "calc(100vw - 16px)" }}>
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">
                Comunicação integrada
              </Badge>
              <Badge variant="outline" className="border-slate-200 text-slate-600">
                {incident.code}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Modo do workspace NEO">
              <Button size="sm" variant={layout === "split" ? "default" : "outline"} onClick={() => setLayout("split")}>
                <Columns3 className="mr-2 h-4 w-4" />
                Lado a lado
              </Button>
              <Button size="sm" variant={layout === "communication" ? "default" : "outline"} onClick={() => setLayout("communication")}>
                <Maximize2 className="mr-2 h-4 w-4" />
                Foco NEO
              </Button>
              <Button size="sm" variant={layout === "dock" ? "default" : "outline"} onClick={() => setLayout("dock")}>
                <LayoutPanelTop className="mr-2 h-4 w-4" />
                Dock inferior
              </Button>
              {application && (
                <Button size="sm" variant="outline" asChild>
                  <a href={application.src} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Segundo monitor
                  </a>
                </Button>
              )}
            </div>
          </div>

          <DialogTitle className="mt-2 flex items-center gap-2 text-xl">
            <MonitorSmartphone className="h-5 w-5 text-sky-700" />
            Ocorrência + NEO Interact
          </DialogTitle>
          <DialogDescription>
            O contexto operacional permanece no AXE Dispatch e a sessão de comunicação permanece isolada no NEO.
          </DialogDescription>
        </DialogHeader>

        <div className={layoutClasses} data-neo-workspace-layout={layout}>
          {contextPanel}

          <section className={layout === "dock" ? "min-w-0 p-4 lg:overflow-y-auto" : "min-w-0 p-4 lg:overflow-y-auto"}>
            {application ? (
              <EmbeddedApplicationFrame application={application} onLifecycleEvent={onCommunicationLifecycle} />
            ) : (
              <div role="status" className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                O NEO Interact não está disponível para este perfil ou ambiente.
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NeoOperationalWorkspace;
