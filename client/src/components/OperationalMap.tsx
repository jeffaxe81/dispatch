import { LeafletMap } from "@/components/LeafletMap";
import { useState } from "react";

type MapIncident = {
  id: number;
  code: string;
  category: string;
  priority: "baixa" | "media" | "alta" | "critica";
  status: string;
  latitude: string;
  longitude: string;
};

type MapTeam = {
  id: number;
  code: string;
  name: string;
  status: string;
  lastLatitude: string | null;
  lastLongitude: string | null;
  lastLocationAt: Date | null;
};

type OperationalMapSettings = {
  centerLatitude: number;
  centerLongitude: number;
  defaultZoom: number;
  mapType: "roadmap" | "satellite" | "terrain" | "hybrid" | "carto";
  trafficEnabled: boolean;
  autoFitEnabled: boolean;
  // "google_only" is a legacy value a settings row saved before Google
  // Maps was removed from the app may still hold; resolveContingencyEnabled
  // treats anything other than "openstreetmap" as "automatic".
  fallbackMode: "automatic" | "openstreetmap" | "google_only";
};

const priorityColor: Record<MapIncident["priority"], string> = {
  baixa: "#0f87a6",
  media: "#d89b00",
  alta: "#e6672c",
  critica: "#c52d45",
};

// "automatic" (default): OpenStreetMap switches to CARTO automatically if
// its tiles fail repeatedly. "openstreetmap": stays on OpenStreetMap even
// if it fails, no automatic contingency. There is no Google Maps option —
// the app has no working Google Maps integration outside the Manus
// platform, so it was removed rather than left silently broken.
export function resolveContingencyEnabled(fallbackMode: OperationalMapSettings["fallbackMode"]) {
  return fallbackMode !== "openstreetmap";
}

export function OperationalMap({ incidents, teams, settings }: { incidents: MapIncident[]; teams: MapTeam[]; settings?: OperationalMapSettings }) {
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const fallbackMode = settings?.fallbackMode ?? "automatic";
  const contingencyEnabled = resolveContingencyEnabled(fallbackMode);
  const positionedTeams = teams.filter(team => team.lastLatitude && team.lastLongitude).length;

  return (
    <div className="space-y-2">
      <section className="relative h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
        <LeafletMap
          center={{ lat: settings?.centerLatitude ?? -27.0976, lng: settings?.centerLongitude ?? -48.9104 }}
          zoom={settings?.defaultZoom ?? 13}
          mapType={settings?.mapType ?? "roadmap"}
          incidents={incidents}
          teams={teams.map(team => ({ latitude: team.lastLatitude, longitude: team.lastLongitude, code: team.code, name: team.name }))}
          onSourceChange={setActiveSource}
          contingencyEnabled={contingencyEnabled}
        />
      </section>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 text-[11px] text-slate-600">
        <p>
          <span className="font-medium text-slate-900">Mapa operacional</span> · {incidents.length} ocorrência(s) · {positionedTeams} equipe(s) posicionada(s)
          {activeSource && <span> · fonte: {activeSource}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(priorityColor).map(([priority, color]) => (
            <span key={priority} className="flex items-center gap-1.5 capitalize"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{priority}</span>
          ))}
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-600" />equipe</span>
        </div>
      </div>
    </div>
  );
}
