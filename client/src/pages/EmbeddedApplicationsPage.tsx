import DashboardLayout from "@/components/DashboardLayout";
import EmbeddedApplicationFrame, { type EmbeddedFrameSecurityEvent } from "@/components/EmbeddedApplicationFrame";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ExternalLink, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";

function EmbeddedApplicationsContent() {
  const applications = trpc.integrations.embeddedApplications.list.useQuery(undefined, { retry: false });
  const [rejectedMessages, setRejectedMessages] = useState(0);

  const onSecurityEvent = useCallback((_event: EmbeddedFrameSecurityEvent) => {
    setRejectedMessages(value => value + 1);
  }, []);

  const application = applications.data?.[0];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 rounded-2xl bg-[radial-gradient(circle_at_84%_0%,rgba(56,189,248,.22),transparent_31%),linear-gradient(112deg,#082f49,#155e75)] px-6 py-7 text-white shadow-lg shadow-slate-900/10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
            <MonitorSmartphone className="h-4 w-4" />
            Aplicações incorporadas
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">NEO Interact integrado</h1>
          <p className="mt-2 text-sm leading-6 text-cyan-50/90">
            A interface externa é carregada em um container responsivo com origem fixa, comunicação postMessage validada e permissões explícitas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border border-cyan-100/40 bg-white/10 text-cyan-50 hover:bg-white/10">
            D-006A
          </Badge>
          <Badge className="border border-emerald-100/40 bg-emerald-50/10 text-emerald-50 hover:bg-emerald-50/10">
            RBAC integrations.view
          </Badge>
        </div>
      </header>

      <QueryState loading={applications.isLoading} error={applications.error} label="aplicações incorporadas" />

      {application && (
        <>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
                  <strong className="text-sm text-slate-900">Destino autorizado</strong>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">{application.src}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-slate-200 text-slate-600">HTTPS</Badge>
                <Badge variant="outline" className="border-slate-200 text-slate-600">width 100%</Badge>
                <Badge variant="outline" className="border-slate-200 text-slate-600">{application.defaultHeight}px inicial</Badge>
              </div>
            </CardContent>
          </Card>

          <EmbeddedApplicationFrame
            application={application}
            onSecurityEvent={onSecurityEvent}
          />

          <Card className="border-slate-200 bg-slate-50/70 shadow-sm">
            <CardContent className="grid gap-3 p-4 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="font-semibold text-slate-800">Origin</span>
                <p className="mt-1 break-all font-mono">{application.origin}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-800">Permissões</span>
                <p className="mt-1">{application.permissions.join(", ")}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-800">Mensagens rejeitadas</span>
                <p className="mt-1">{rejectedMessages}</p>
              </div>
              <div>
                <span className="flex items-center gap-1 font-semibold text-slate-800">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Sessão externa
                </span>
                <p className="mt-1">Autenticação permanece sob responsabilidade do NEO.</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!applications.isLoading && !applications.error && !application && (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-500">
            Nenhuma aplicação incorporada está habilitada para este ambiente.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function EmbeddedApplicationsPage() {
  return (
    <DashboardLayout>
      <EmbeddedApplicationsContent />
    </DashboardLayout>
  );
}
