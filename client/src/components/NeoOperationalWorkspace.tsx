import EmbeddedApplicationFrame from "@/components/EmbeddedApplicationFrame";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, MonitorSmartphone, ShieldCheck, UserRound } from "lucide-react";
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

export function NeoOperationalWorkspace({
  open,
  onOpenChange,
  application,
  incident,
  teamCode,
  vehiclePrefix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: EmbeddedApplication | null;
  incident: NeoWorkspaceIncident;
  teamCode?: string | null;
  vehiclePrefix?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] w-[96vw] max-w-[1700px] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">
              Comunicação integrada
            </Badge>
            <Badge variant="outline" className="border-slate-200 text-slate-600">
              {incident.code}
            </Badge>
          </div>
          <DialogTitle className="mt-2 flex items-center gap-2 text-xl">
            <MonitorSmartphone className="h-5 w-5 text-sky-700" />
            Ocorrência + NEO Interact
          </DialogTitle>
          <DialogDescription>
            O contexto operacional permanece no AXE Dispatch e a sessão de comunicação permanece isolada no NEO.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto bg-slate-50 lg:grid-cols-[minmax(340px,0.72fr)_minmax(0,1.28fr)] lg:overflow-hidden">
          <aside className="space-y-4 border-b border-slate-200 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
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

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
              <strong>Separação de contexto:</strong> nesta fase, nenhum dado da ocorrência é enviado automaticamente ao iframe. O NEO recebe apenas a mensagem técnica de inicialização prevista no contrato.
            </section>
          </aside>

          <section className="min-w-0 p-4 lg:overflow-y-auto">
            {application ? (
              <EmbeddedApplicationFrame application={application} />
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
