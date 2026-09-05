export type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt?: string;
};

export type GeoJsonLineString = {
  type: "LineString";
  coordinates: [number, number][];
};

export type RouteProfile = "car" | "bike" | "foot";

export type RouteRequest = {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: GeoPoint[];
  profile?: RouteProfile;
};

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoJsonLineString;
  provider: string;
};

export interface RouteProvider {
  readonly name: string;
  calculateRoute(request: RouteRequest): Promise<RouteResult>;
}

export function isValidGeoPoint(point: GeoPoint) {
  return Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && point.longitude >= -180
    && point.longitude <= 180;
}

export function haversineDistanceMeters(origin: GeoPoint, destination: GeoPoint) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLon = toRadians(destination.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}
