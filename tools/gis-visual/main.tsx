import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { OperationalMap } from "@/components/OperationalMap";
import type { GeoJsonLineString } from "@shared/gis";
import "./homologation.css";

const incidents = [
  {
    id: 101,
    code: "OC-2026-091",
    category: "Iluminação pública",
    priority: "alta" as const,
    status: "aguardando_despacho",
    latitude: "-27.1009",
    longitude: "-48.9184",
  },
  {
    id: 102,
    code: "OC-2026-092",
    category: "Semáforo intermitente",
    priority: "critica" as const,
    status: "triagem",
    latitude: "-27.0918",
    longitude: "-48.9054",
  },
  {
    id: 103,
    code: "OC-2026-093",
    category: "Bomba d'água",
    priority: "media" as const,
    status: "despachada",
    latitude: "-27.1072",
    longitude: "-48.9008",
  },
];

const teams = [
  {
    id: 201,
    code: "EQ-01",
    name: "Equipe Centro",
    status: "disponivel",
    lastLatitude: "-27.0963",
    lastLongitude: "-48.9098",
    lastLocationAt: new Date("2026-09-03T16:45:00Z"),
  },
  {
    id: 202,
    code: "EQ-07",
    name: "Equipe Norte",
    status: "em_deslocamento",
    lastLatitude: "-27.0874",
    lastLongitude: "-48.9157",
    lastLocationAt: new Date("2026-09-03T16:46:00Z"),
  },
];

const route: GeoJsonLineString = {
  type: "LineString",
  coordinates: [
    [-48.9098, -27.0963],
    [-48.9121, -27.0975],
    [-48.9142, -27.0991],
    [-48.9184, -27.1009],
  ],
};

const settings = {
  centerLatitude: -27.0976,
  centerLongitude: -48.9104,
  defaultZoom: 13,
  mapType: "roadmap" as const,
  trafficEnabled: false,
  autoFitEnabled: true,
  fallbackMode: "automatic" as const,
};

function HomologationPage() {
  useEffect(() => {
    const updateStatus = () => {
      const viewportWidth = document.documentElement.clientWidth;
      const contentWidth = document.documentElement.scrollWidth;
      document.body.dataset.gisOverflow =
        contentWidth <= viewportWidth + 1 ? "ok" : "overflow";
      document.body.dataset.gisLeaflet =
        document.querySelector(".leaflet-container") ? "ready" : "pending";
    };

    updateStatus();
    const first = window.setTimeout(updateStatus, 1200);
    const second = window.setTimeout(updateStatus, 3500);
    window.addEventListener("resize", updateStatus);

    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
      window.removeEventListener("resize", updateStatus);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[1180px] space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-700">
            AXE Dispatch
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">
            GIS-1 — Homologação visual
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Cenário controlado para validar OpenStreetMap/Leaflet, ocorrências,
            equipes, geometria de rota, legenda operacional e responsividade.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[.12em] text-slate-400">Provider</p>
            <p className="mt-1 font-semibold text-slate-900">OpenStreetMap / Leaflet</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[.12em] text-slate-400">Rota</p>
            <p className="mt-1 font-semibold text-slate-900">GeoJSON LineString</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[.12em] text-slate-400">Modo</p>
            <p className="mt-1 font-semibold text-slate-900">automatic → OSM</p>
          </div>
        </section>

        <OperationalMap
          incidents={incidents}
          teams={teams}
          settings={settings}
          route={route}
        />

        <footer className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
          Evidência controlada: 3 ocorrências · 2 equipes posicionadas · 1 rota.
        </footer>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<HomologationPage />);
