import { MapView } from "@/components/Map";
import type { GeoJsonLineString } from "@shared/gis";
import { evaluateTeamPositionFreshness, summarizeTeamPositionFreshness } from "@/lib/teamPositionFreshness";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

const LeafletOperationalMap = lazy(() => import("@/components/LeafletOperationalMap"));

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

export function resolveOperationalMapMode(fallbackMode: OperationalMapSettings["fallbackMode"], googleUnavailable: boolean, openStreetMapUnavailable = false) {
  const useOpenStreetMap = fallbackMode === "openstreetmap" || fallbackMode === "automatic";
  return {
    useOpenStreetMap,
    showGoogleOnlyUnavailable: fallbackMode === "google_only" && googleUnavailable,
    degraded: (useOpenStreetMap && openStreetMapUnavailable) || (fallbackMode === "google_only" && googleUnavailable),
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
  const [openStreetMapUnavailable, setOpenStreetMapUnavailable] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [staleAfterMinutes, setStaleAfterMinutes] = useState(5);
  const freshnessSummary = summarizeTeamPositionFreshness(teams, new Date(), staleAfterMinutes);
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
      const freshness = evaluateTeamPositionFreshness(team, new Date(), staleAfterMinutes);
      markers.push(
        new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: latitude, lng: longitude },
          title: `${team.code} — ${team.name} · ${freshness === "stale" ? "posição desatualizada" : freshness === "unknown" ? "horário da posição desconhecido" : "posição atual"}`,
          content: markerElement(`${team.code}: ${team.status} · ${freshness}`, freshness === "stale" ? "#b45309" : freshness === "unknown" ? "#64748b" : "#147ab7", "▣"),
        }),
      );
    });
    markerRefs.current = markers;

    return () => markers.forEach(marker => {
      marker.map = null;
    });
  }, [incidents, map, teams, staleAfterMinutes]);

  const fallbackMode = settings?.fallbackMode ?? "automatic";
  const { useOpenStreetMap, showGoogleOnlyUnavailable: googleOnlyUnavailable, degraded } = resolveOperationalMapMode(fallbackMode, mapUnavailable, openStreetMapUnavailable);

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
      {useOpenStreetMap && <Suspense fallback={<div role="status" className="flex h-[430px] w-full items-center justify-center bg-slate-100 text-sm text-slate-500">Carregando mapa OpenStreetMap...</div>}><LeafletOperationalMap center={{ lat: settings?.centerLatitude ?? -27.0976, lng: settings?.centerLongitude ?? -48.9104 }} zoom={settings?.defaultZoom ?? 13} incidents={incidents} teams={teams.map(team => ({ id: team.id, latitude: team.lastLatitude, longitude: team.lastLongitude, code: team.code, name: team.name, status: team.status + (evaluateTeamPositionFreshness(team, new Date(), staleAfterMinutes) === "stale" ? " · posição desatualizada" : "") }))} route={route} onTileError={() => setOpenStreetMapUnavailable(true)} /></Suspense>}
      {degraded && <div role="alert" className="absolute left-4 top-16 max-w-sm rounded-lg border border-amber-300/90 bg-amber-50/95 px-3 py-2 text-xs text-amber-950 shadow-sm backdrop-blur"><p className="font-semibold">GIS degradado</p><p className="mt-0.5 leading-4">O mapa base externo apresentou falha. Ocorrências, equipes e demais funções operacionais continuam disponíveis; valide rotas externas antes de usá-las para decisão.</p></div>}
      {googleOnlyUnavailable && <div role="status" className="absolute right-4 top-4 max-w-xs rounded-lg border border-amber-200/90 bg-amber-50/95 px-3 py-2 text-xs text-amber-950 shadow-sm backdrop-blur"><p className="font-semibold">Google Maps indisponível</p><p className="mt-0.5 leading-4">Modo somente Google ativo. Altere a contingência nas Configurações.</p></div>}
      <div className="pointer-events-auto absolute bottom-14 right-4 z-10 max-w-xs rounded-lg border border-white/80 bg-white/95 px-3 py-2 text-xs text-slate-800 shadow-sm backdrop-blur" role="status">
        <label className="block font-semibold text-slate-900" htmlFor="stale-position-limit">Limite de atualização (min)</label>
        <input id="stale-position-limit" type="number" min={1} max={1440} step={1}
          aria-label="Limite para posição desatualizada em minutos"
          className="mt-1 h-8 w-24 rounded-md border border-slate-300 bg-white px-2 text-sm"
          value={staleAfterMinutes}
          onChange={event => {
            const value = Number(event.target.value);
            if (Number.isSafeInteger(value) && value >= 1 && value <= 1440) setStaleAfterMinutes(value);
          }} />
        <p className="mt-1">{freshnessSummary.stale} posição(ões) desatualizada(s); {freshnessSummary.unknown} sem horário confiável.</p>
        {freshnessSummary.stale > 0 && <p role="alert" className="mt-1 font-semibold text-amber-800">Atenção: não use posições antigas para decisões de despacho sem confirmação.</p>}
      </div>
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
