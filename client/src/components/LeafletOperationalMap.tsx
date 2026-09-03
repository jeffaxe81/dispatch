import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { GeoJsonLineString } from "@shared/gis";
import { geoJsonLineStringToLeafletPositions } from "./leafletGeometry";

type GeoPoint = { latitude: string | number | null; longitude: string | number | null };

type LeafletIncident = GeoPoint & {
  id?: number;
  code: string;
  category?: string;
  priority: string;
};

type LeafletTeam = GeoPoint & {
  id?: number;
  code: string;
  name: string;
  status?: string;
};

type LeafletOperationalMapProps = {
  center: { lat: number; lng: number };
  zoom: number;
  incidents: LeafletIncident[];
  teams: LeafletTeam[];
  route?: GeoJsonLineString | null;
  className?: string;
};

const priorityPathOptions: Record<string, { color: string; fillColor: string }> = {
  baixa: { color: "#0f87a6", fillColor: "#0f87a6" },
  media: { color: "#d89b00", fillColor: "#d89b00" },
  alta: { color: "#e6672c", fillColor: "#e6672c" },
  critica: { color: "#c52d45", fillColor: "#c52d45" },
};

function asLatLng(point: GeoPoint): LatLngExpression | null {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) return null;
  return [latitude, longitude];
}

function AutoFit({
  center,
  zoom,
  points,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  points: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points as LatLngBoundsExpression, { padding: [28, 28], maxZoom: 16 });
      return;
    }
    map.setView([center.lat, center.lng], zoom);
  }, [center.lat, center.lng, map, points, zoom]);

  return null;
}

export default function LeafletOperationalMap({
  center,
  zoom,
  incidents,
  teams,
  route,
  className = "h-[430px] w-full",
}: LeafletOperationalMapProps) {
  const incidentPoints = incidents
    .map(incident => ({ incident, position: asLatLng(incident) }))
    .filter((entry): entry is { incident: LeafletIncident; position: [number, number] } => Array.isArray(entry.position));

  const teamPoints = teams
    .map(team => ({ team, position: asLatLng(team) }))
    .filter((entry): entry is { team: LeafletTeam; position: [number, number] } => Array.isArray(entry.position));

  const routePositions = route ? geoJsonLineStringToLeafletPositions(route) : [];
  const allPoints = [
    ...incidentPoints.map(entry => entry.position),
    ...teamPoints.map(entry => entry.position),
    ...routePositions,
  ];

  return (
    <div className={className}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        className="h-full w-full"
        zoomControl
        attributionControl
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {incidentPoints.map(({ incident, position }) => {
          const style = priorityPathOptions[incident.priority] ?? priorityPathOptions.media;
          return (
            <CircleMarker
              key={`incident-${incident.id ?? incident.code}`}
              center={position}
              radius={10}
              pathOptions={{ ...style, fillOpacity: 0.9, weight: 3 }}
            >
              <Popup>
                <strong>{incident.code}</strong>
                {incident.category ? <div>{incident.category}</div> : null}
              </Popup>
            </CircleMarker>
          );
        })}

        {teamPoints.map(({ team, position }) => (
          <CircleMarker
            key={`team-${team.id ?? team.code}`}
            center={position}
            radius={9}
            pathOptions={{ color: "#147ab7", fillColor: "#147ab7", fillOpacity: 0.9, weight: 3 }}
          >
            <Popup>
              <strong>{team.code}</strong>
              <div>{team.name}</div>
              {team.status ? <small>{team.status}</small> : null}
            </Popup>
          </CircleMarker>
        ))}

        {routePositions.length >= 2 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ weight: 5, opacity: 0.85 }}
          />
        )}

        <AutoFit center={center} zoom={zoom} points={allPoints} />
      </MapContainer>
    </div>
  );
}
