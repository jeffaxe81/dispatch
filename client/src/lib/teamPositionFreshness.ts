export type PositionFreshness = "current" | "stale" | "unknown" | "unavailable";

/**
 * AXED-F058: positions are stale only when they have valid coordinates and
 * a valid timestamp older than the configured threshold. Missing timestamps
 * are UNKNOWN, never silently interpreted as fresh.
 */
export function evaluateTeamPositionFreshness(
  position: { lastLatitude: string | null; lastLongitude: string | null; lastLocationAt: Date | string | null },
  now: Date,
  staleAfterMinutes: number,
): PositionFreshness {
  if (!Number.isSafeInteger(staleAfterMinutes) || staleAfterMinutes < 1 || staleAfterMinutes > 1440)
    throw new Error("O limite de atualização da posição deve estar entre 1 e 1440 minutos.");
  const lat = position.lastLatitude === null ? NaN : Number(position.lastLatitude);
  const lon = position.lastLongitude === null ? NaN : Number(position.lastLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return "unavailable";
  if (!position.lastLocationAt) return "unknown";
  const then = new Date(position.lastLocationAt).getTime();
  const time = now.getTime();
  if (!Number.isFinite(then) || !Number.isFinite(time) || then > time)
    return "unknown";
  return time - then > staleAfterMinutes * 60_000 ? "stale" : "current";
}

export function summarizeTeamPositionFreshness<T extends {
  lastLatitude: string | null;
  lastLongitude: string | null;
  lastLocationAt: Date | string | null;
}>(
  authorizedTeams: readonly T[],
  now: Date,
  staleAfterMinutes: number,
) {
  const result = { current: 0, stale: 0, unknown: 0, unavailable: 0 };
  for (const team of authorizedTeams) result[evaluateTeamPositionFreshness(team, now, staleAfterMinutes)]++;
  return result;
}
