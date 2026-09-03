import { haversineDistanceMeters, isValidGeoPoint, type GeoPoint, type RouteProvider, type RouteResult } from "@shared/gis";

export type CandidateTeamPoint = {
  teamId: number;
  code: string;
  name: string;
  status: string;
  position: GeoPoint;
};

export type RankedTeamCandidate = CandidateTeamPoint & {
  straightLineDistanceMeters: number;
  route?: RouteResult;
  routeError?: string;
};

export async function rankTeamCandidates(
  incident: GeoPoint,
  candidates: CandidateTeamPoint[],
  routeProvider: RouteProvider,
  maxRouteCandidates = 3,
): Promise<RankedTeamCandidate[]> {
  if (!isValidGeoPoint(incident)) {
    throw new Error("Coordenada da ocorrência inválida.");
  }

  const valid = candidates
    .filter(candidate => isValidGeoPoint(candidate.position))
    .map(candidate => ({
      ...candidate,
      straightLineDistanceMeters: haversineDistanceMeters(incident, candidate.position),
    }))
    .sort((a, b) => a.straightLineDistanceMeters - b.straightLineDistanceMeters);

  const routed = await Promise.all(valid.slice(0, maxRouteCandidates).map(async candidate => {
    try {
      const route = await routeProvider.calculateRoute({
        origin: candidate.position,
        destination: incident,
        profile: "car",
      });
      return { ...candidate, route };
    } catch (error) {
      return {
        ...candidate,
        routeError: error instanceof Error ? error.message : "Falha ao calcular rota.",
      };
    }
  }));

  const untouched = valid.slice(maxRouteCandidates);
  return [...routed, ...untouched].sort((a, b) => {
    const aEta = a.route?.durationSeconds ?? Number.POSITIVE_INFINITY;
    const bEta = b.route?.durationSeconds ?? Number.POSITIVE_INFINITY;
    if (aEta !== bEta) return aEta - bEta;
    return a.straightLineDistanceMeters - b.straightLineDistanceMeters;
  });
}
