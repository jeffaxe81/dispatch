import { createRoot } from "react-dom/client";
import React, { useEffect } from "react";
import { NeoOperationalWorkspace } from "@/components/NeoOperationalWorkspace";
import { NEO_INTERACT_EMBEDDED_APPLICATION } from "@shared/embeddedApplications";
import "./homologation.css";

const incident = {
  code: "OC-2026-127",
  category: "Iluminação pública",
  priorityLabel: "Alta",
  statusLabel: "Aguardando despacho",
  address: "Av. Exemplo Operacional, 100 — Centro",
  requesterName: "Solicitante de homologação",
  requesterContact: "(00) 00000-0000",
  description: "Ponto de iluminação sem funcionamento. Cenário controlado para homologação visual da composição AXE Dispatch + NEO Interact.",
};

function VisualHarness() {
  useEffect(() => {
    const inspect = () => {
      const dialog = document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
      const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="NEO Interact"]');
      const viewportWidth = document.documentElement.clientWidth;
      const contentWidth = document.documentElement.scrollWidth;
      const dialogWidth = Math.round(dialog?.getBoundingClientRect().width ?? 0);
      const iframeWidth = Math.round(iframe?.getBoundingClientRect().width ?? 0);

      document.body.dataset.neoOverflow = contentWidth <= viewportWidth + 1 ? "ok" : "overflow";
      document.body.dataset.neoIframe = iframe?.src === "https://gscprj.saas.digitro.cloud/neo/" ? "configured" : "missing";
      document.body.dataset.neoDialogWidth = String(dialogWidth);
      document.body.dataset.neoIframeWidth = String(iframeWidth);
      document.body.dataset.neoLayout =
        viewportWidth >= 1024 && dialogWidth >= 1000 ? "desktop-split" : "mobile-stack";
    };

    inspect();
    const first = window.setTimeout(inspect, 1500);
    const second = window.setTimeout(inspect, 5500);
    window.addEventListener("resize", inspect);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
      window.removeEventListener("resize", inspect);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Harness D-006C — validar modos Lado a lado, Foco NEO, Dock inferior e responsividade.
      </div>
      <NeoOperationalWorkspace
        open
        onOpenChange={() => undefined}
        application={NEO_INTERACT_EMBEDDED_APPLICATION}
        incident={incident}
        teamCode="EQ-01"
        vehiclePrefix="VTR-07"
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<VisualHarness />);
