/** F060: fail closed when an optional team coordinate is absent or malformed.
 * Number(null), Number("") and Number(" ") are 0 and MUST NOT create a phantom pin.
 */
export type DispatchPosition = {latitude: number; longitude: number};

function parseCoordinate(value: string | number | null | undefined, min: number, max: number) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
export function parseDispatchCoordinates(
  latitude: string | number | null | undefined,
  longitude: string | number | null | undefined,
): DispatchPosition | null {
  const lat = parseCoordinate(latitude, -90, 90);
  const lon = parseCoordinate(longitude, -180, 180);
  return lat === null || lon === null ? null : {latitude: lat, longitude: lon};
}
