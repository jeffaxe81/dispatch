import { Button } from "@/components/ui/button";
import { ExternalLink, MapPinned, RefreshCw, WifiOff } from "lucide-react";

type GeoPoint = { latitude: string | number | null; longitude: string | number | null };

type OpenStreetMapFallbackProps = {
  center: { lat: number; lng: number };
  zoom: number;
  incidents: Array<GeoPoint & { code: string; priority: string }>;
  teams: Array<GeoPoint & { code: string; name: string }>;
  onRetryGoogle?: () => void;
};

const defaultDeltaByZoom = (zoom: number) => Math.max(0.012, Math.min(1.1, 0.5 / Math.pow(2, Math.max(0, zoom - 10) / 2)));

function asPoint(point: GeoPoint) {
  const lat = Number(point.latitude);
  const lng = Number(point.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function buildOpenStreetMapEmbedUrl(center: { lat: number; lng: number }, zoom: number, points: GeoPoint[]) {
  const validPoints = [center, ...points.map(asPoint).filter((point): point is { lat: number; lng: number } => Boolean(point))];
  const delta = defaultDeltaByZoom(zoom);
  const latitudes = validPoints.length > 1 ? validPoints.map(point => point.lat) : [center.lat - delta, center.lat + delta];
  const longitudes = validPoints.length > 1 ? validPoints.map(point => point.lng) : [center.lng - delta, center.lng + delta];
  const padding = validPoints.length ? Math.max(0.006, Math.max(Math.max(...latitudes) - Math.min(...latitudes), Math.max(...longitudes) - Math.min(...longitudes)) * 0.18) : 0;
  const minLat = Math.max(-89.9, Math.min(...latitudes) - padding);
  const maxLat = Math.min(89.9, Math.max(...latitudes) + padding);
  const minLng = Math.max(-179.9, Math.min(...longitudes) - padding);
  const maxLng = Math.min(179.9, Math.max(...longitudes) + padding);
  const params = new URLSearchParams({ bbox: `${minLng},${minLat},${maxLng},${maxLat}`, layer: "mapnik", marker: `${center.lat},${center.lng}` });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

function OpenStreetMapFallback({ center, zoom, incidents, teams, onRetryGoogle }: OpenStreetMapFallbackProps) {
  const visibleIncidents = incidents.filter(asPoint);
  const visibleTeams = teams.filter(asPoint);
  const mapUrl = buildOpenStreetMapEmbedUrl(center, zoom, [...visibleIncidents, ...visibleTeams]);
  const openMapUrl = `https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lng}#map=${Math.max(1, Math.min(19, Math.round(zoom)))}/${center.lat}/${center.lng}`;

  return <div className="absolute inset-0 overflow-hidden bg-slate-100"><iframe title="Mapa de contingência OpenStreetMap" src={mapUrl} className="h-full w-full border-0" loading="lazy" /><div role="status" className="absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-lg border border-amber-200/90 bg-amber-50/95 px-2.5 py-2 text-xs text-amber-950 shadow-sm backdrop-blur"><WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-700" /><span className="font-medium">{onRetryGoogle ? "OpenStreetMap em contingência" : "OpenStreetMap ativo"}</span>{onRetryGoogle && <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-amber-900 hover:bg-amber-100" onClick={onRetryGoogle}><RefreshCw className="mr-1 h-3 w-3" />Tentar Google</Button>}<a href={openMapUrl} target="_blank" rel="noreferrer" aria-label="Abrir mapa de contingência em nova aba" className="rounded p-1 text-amber-900 hover:bg-amber-100"><ExternalLink className="h-3.5 w-3.5" /></a></div><div className="absolute bottom-4 right-4 max-w-xs rounded-xl border border-white/80 bg-white/95 p-3 text-xs shadow-sm backdrop-blur"><p className="flex items-center gap-1.5 font-semibold text-slate-900"><MapPinned className="h-4 w-4 text-sky-700" />Pontos acompanhados</p><p className="mt-1.5 text-slate-600">{visibleIncidents.length} ocorrência(s) e {visibleTeams.length} equipe(s) com posição válida.</p><a className="mt-2 inline-block text-[11px] text-slate-500 underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></div></div>;
}

export default OpenStreetMapFallback;
