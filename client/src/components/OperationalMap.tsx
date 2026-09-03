import { MapView } from "@/components/Map";
import LeafletOperationalMap from "@/components/LeafletOperationalMap";
import type { GeoJsonLineString } from "@shared/gis";
import { useEffect, useRef, useState } from "react";

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
  mapType: "roadmap" | "satellite" | "terrain" | "hybrid";
  trafficEnabled: boolean;
  autoFitEnabled: boolean;
  fallbackMode: "automatic" | "openstreetmap" | "google_only";
};

const priorityColor: Record<MapIncident["priority"], string> = {
  baixa: "#0f87a6",
  media: "#d89b00",
  alta: "#e6672c",
  critica: "#c52d45",
};

export function resolveOperationalMapMode(fallbackMode: OperationalMapSettings["fallbackMode"], googleUnavailable: boolean) {
  return {
    useOpenStreetMap: fallbackMode === "openstreetmap" || fallbackMode === "automatic",
    showGoogleOnlyUnavailable: fallbackMode === "google_only" && googleUnavailable,
  };
}

function markerElement(label: string, color: string, symbol: string) {
  const element = document.createElement("div");
  element.className = "map-marker";
  element.setAttribute("aria-label", label);
  element.style.cssText = `display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${color};color:#fff;border:3px solid rgba(255,255,255,.94);box-shadow:0 8px 18px rgba(13,39,52,.32);font-size:14px;font-weight:800;`;
  element.textContent = symbol;
  return element;
}

export function OperationalMap({ incidents, teams, settings, route }: { incidents: MapIncident[]; teams: MapTeam[]; settings?: OperationalMapSettings; route?: GeoJsonLineString | null }) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const markerRefs = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  useEffect(() => {
    if (!map || !window.google?.maps?.marker) return;
    markerRefs.current.forEach(marker => {
      marker.map = null;
    });
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];

    incidents.forEach(incident => {
      const latitude = Number(incident.latitude);
      const longitude = Number(incident.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      markers.push(
        new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: latitude, lng: longitude },
          title: `${incident.code} — ${incident.category}`,
          content: markerElement(`${incident.priority}: ${incident.category}`, priorityColor[incident.priority], "!"),
        }),
      );
    });

    teams.forEach(team => {
      const latitude = Number(team.lastLatitude);
      const longitude = Number(team.lastLongitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      markers.push(
        new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: latitude, lng: longitude },
          title: `${team.code} — ${team.name}`,
          content: markerElement(`${team.code}: ${team.status}`, "#147ab7", "▣"),
        }),
      );
    });
    markerRefs.current = markers;

    return () => markers.forEach(marker => {
      marker.map = null;
    });
  }, [incidents, map, teams]);

  const fallbackMode = settings?.fallbackMode ?? "automatic";
  const { useOpenStreetMap, showGoogleOnlyUnavailable: googleOnlyUnavailable } = resolveOperationalMapMode(fallbackMode, mapUnavailable);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      {!useOpenStreetMap && <MapView
        key={`${mapAttempt}-${settings?.centerLatitude ?? -27.0976}-${settings?.centerLongitude ?? -48.9104}-${settings?.defaultZoom ?? 13}-${settings?.mapType ?? "roadmap"}-${settings?.trafficEnabled ?? false}`}
        initialCenter={{ lat: settings?.centerLatitude ?? -27.0976, lng: settings?.centerLongitude ?? -48.9104 }}
        initialZoom={settings?.defaultZoom ?? 13}
        mapTypeId={settings?.mapType ?? "roadmap"}
        trafficEnabled={settings?.trafficEnabled ?? false}
        className="h-[430px] w-full"
        onMapReady={map => {
          setMapUnavailable(false);
          setMap(map);
        }}
        onMapError={() => { setMap(null); setMapUnavailable(true); }}
      />}
      {useOpenStreetMap && <LeafletOperationalMap center={{ lat: settings?.centerLatitude ?? -27.0976, lng: settings?.centerLongitude ?? -48.9104 }} zoom={settings?.defaultZoom ?? 13} incidents={incidents} teams={teams.map(team => ({ id: team.id, latitude: team.lastLatitude, longitude: team.lastLongitude, code: team.code, name: team.name, status: team.status }))} route={route} />}
      {googleOnlyUnavailable && <div role="status" className="absolute right-4 top-4 max-w-xs rounded-lg border border-amber-200/90 bg-amber-50/95 px-3 py-2 text-xs text-amber-950 shadow-sm backdrop-blur"><p className="font-semibold">Google Maps indisponível</p><p className="mt-0.5 leading-4">Modo somente Google ativo. Altere a contingência nas Configurações.</p></div>}
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur">
        <p className="font-semibold text-slate-900">Mapa operacional</p>
        <p>{incidents.length} ocorrência(s) · {teams.filter(team => team.lastLatitude && team.lastLongitude).length} equipe(s) posicionada(s)</p>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap gap-2 rounded-xl border border-white/70 bg-white/90 p-2 text-[11px] text-slate-700 shadow-sm backdrop-blur">
        {Object.entries(priorityColor).map(([priority, color]) => (
          <span key={priority} className="flex items-center gap-1.5 capitalize"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{priority}</span>
        ))}
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sky-600" />equipe</span>
      </div>
    </section>
  );
}
