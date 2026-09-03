import type { GeoJsonLineString } from "@shared/gis";

export function geoJsonLineStringToLeafletPositions(line: GeoJsonLineString): [number, number][] {
  return line.coordinates
    .filter(([longitude, latitude]) =>
      Number.isFinite(longitude)
      && Number.isFinite(latitude)
      && latitude >= -90
      && latitude <= 90
      && longitude >= -180
      && longitude <= 180,
    )
    .map(([longitude, latitude]) => [latitude, longitude]);
}
