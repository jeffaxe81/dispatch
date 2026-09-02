import { Button } from "@/components/ui/button";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type GeoPoint = { latitude: string | number | null; longitude: string | number | null };

type MapType = "roadmap" | "satellite" | "terrain" | "hybrid";

type TileLayerConfig = { name: string; url: string; attribution: string; maxZoom: number };

type LeafletMapProps = {
  center: { lat: number; lng: number };
  zoom: number;
  mapType?: MapType;
  incidents: Array<GeoPoint & { code: string; priority: string }>;
  teams: Array<GeoPoint & { code: string; name: string }>;
  onRetryGoogle?: () => void;
};

const PRIORITY_COLOR: Record<string, string> = {
  baixa: "#0f87a6",
  media: "#d89b00",
  alta: "#e6672c",
  critica: "#c52d45",
};

// All tile sources below are free, public, and require no API key — real
// internet access, no proxy or third-party account needed.
const PRIMARY_TILE_LAYERS: Record<MapType, TileLayerConfig> = {
  roadmap: {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  terrain: {
    name: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap contributors, SRTM — style: &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a>',
    maxZoom: 17,
  },
  satellite: {
    name: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  hybrid: {
    name: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
};

// Second-tier contingency: only OpenStreetMap's own tile servers (the
// roadmap default) have a documented fair-use policy that discourages
// sustained production traffic, so that's the one type with a backup.
// CARTO's basemaps are free, keyless, and built on the same OSM data.
const CARTO_BACKUP_LAYER: TileLayerConfig = {
  name: "CARTO (contingência)",
  url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  attribution: '&copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a> — dados &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 20,
};

const BACKUP_TILE_LAYERS: Partial<Record<MapType, TileLayerConfig>> = {
  roadmap: CARTO_BACKUP_LAYER,
};

// Consecutive tile failures required before switching to the backup
// source — avoids swapping over a single flaky tile request.
const TILE_ERROR_THRESHOLD = 3;

export function resolveTileLayer(mapType: MapType | undefined, useBackup = false): TileLayerConfig {
  const type = mapType ?? "roadmap";
  if (useBackup) return BACKUP_TILE_LAYERS[type] ?? PRIMARY_TILE_LAYERS[type] ?? PRIMARY_TILE_LAYERS.roadmap;
  return PRIMARY_TILE_LAYERS[type] ?? PRIMARY_TILE_LAYERS.roadmap;
}

export function asPoint(point: GeoPoint): { lat: number; lng: number } | null {
  const lat = Number(point.latitude);
  const lng = Number(point.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function markerIcon(color: string, symbol: string) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${color};color:#fff;border:3px solid rgba(255,255,255,.94);box-shadow:0 8px 18px rgba(13,39,52,.32);font-size:13px;font-weight:800;">${symbol}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function LeafletMap({ center, zoom, mapType = "roadmap", incidents, teams, onRetryGoogle }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const tileErrorCountRef = useRef(0);
  const [usingBackupTiles, setUsingBackupTiles] = useState(false);
  const [activeTileSourceName, setActiveTileSourceName] = useState(() => resolveTileLayer(mapType).name);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lng], zoom);
  }, [center.lat, center.lng, zoom]);

  // A map type change starts fresh on the primary source again.
  useEffect(() => {
    tileErrorCountRef.current = 0;
    setUsingBackupTiles(false);
  }, [mapType]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = resolveTileLayer(mapType, usingBackupTiles);
    setActiveTileSourceName(layer.name);
    tileErrorCountRef.current = 0;

    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const tileLayer = L.tileLayer(layer.url, { attribution: layer.attribution, maxZoom: layer.maxZoom });
    tileLayer.on("tileerror", () => {
      if (usingBackupTiles || !BACKUP_TILE_LAYERS[mapType ?? "roadmap"]) return;
      tileErrorCountRef.current += 1;
      if (tileErrorCountRef.current >= TILE_ERROR_THRESHOLD) setUsingBackupTiles(true);
    });
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
  }, [mapType, usingBackupTiles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(marker => marker.remove());
    const markers: L.Marker[] = [];

    incidents.forEach(incident => {
      const point = asPoint(incident);
      if (!point) return;
      markers.push(
        L.marker([point.lat, point.lng], { icon: markerIcon(PRIORITY_COLOR[incident.priority] ?? "#334155", "!") })
          .addTo(map)
          .bindTooltip(`${incident.code} — ${incident.priority}`),
      );
    });

    teams.forEach(team => {
      const point = asPoint(team);
      if (!point) return;
      markers.push(
        L.marker([point.lat, point.lng], { icon: markerIcon("#147ab7", "▣") })
          .addTo(map)
          .bindTooltip(`${team.code} — ${team.name}`),
      );
    });

    markersRef.current = markers;
    return () => markers.forEach(marker => marker.remove());
  }, [incidents, teams]);

  const visibleIncidents = incidents.filter(asPoint).length;
  const visibleTeams = teams.filter(asPoint).length;

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />
      <div role="status" className="pointer-events-none absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-lg border border-emerald-200/90 bg-emerald-50/95 px-2.5 py-2 text-xs text-emerald-950 shadow-sm backdrop-blur">
        <span className="font-medium">
          {activeTileSourceName} ativo · {visibleIncidents} ocorrência(s) · {visibleTeams} equipe(s)
        </span>
        {onRetryGoogle && (
          <Button size="sm" variant="ghost" className="pointer-events-auto h-6 px-1.5 text-[11px] text-emerald-900 hover:bg-emerald-100" onClick={onRetryGoogle}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Tentar Google
          </Button>
        )}
      </div>
    </div>
  );
}

export default LeafletMap;
