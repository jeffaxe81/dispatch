import {
  isValidGeoPoint,
  type GeoPoint,
  type RouteProfile,
  type RouteProvider,
  type RouteRequest,
  type RouteResult,
} from "@shared/gis";

type FetchLike = typeof fetch;

type OsrmResponse = {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      type?: string;
      coordinates?: unknown;
    };
  }>;
};

const profileMap: Record<RouteProfile, string> = {
  car: "driving",
  bike: "cycling",
  foot: "walking",
};

export class RouteProviderError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_POINT" | "TIMEOUT" | "UNAVAILABLE" | "INVALID_RESPONSE",
  ) {
    super(message);
    this.name = "RouteProviderError";
  }
}

function asCoordinate(point: GeoPoint) {
  if (!isValidGeoPoint(point)) {
    throw new RouteProviderError("Coordenada geográfica inválida.", "INVALID_POINT");
  }
  return `${point.longitude},${point.latitude}`;
}

function isLineStringCoordinates(value: unknown): value is [number, number][] {
  return Array.isArray(value)
    && value.length >= 2
    && value.every(item =>
      Array.isArray(item)
      && item.length >= 2
      && Number.isFinite(item[0])
      && Number.isFinite(item[1]),
    );
}

export class OsrmRouteProvider implements RouteProvider {
  readonly name = "osrm";

  constructor(
    private readonly baseUrl = process.env.OSRM_BASE_URL || "https://router.project-osrm.org",
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 5_000,
  ) {}

  async calculateRoute(request: RouteRequest): Promise<RouteResult> {
    const coordinates = [
      request.origin,
      ...(request.waypoints ?? []),
      request.destination,
    ].map(asCoordinate).join(";");

    const profile = profileMap[request.profile ?? "car"];
    const url = new URL(`/route/v1/${profile}/${coordinates}`, this.baseUrl);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "false");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new RouteProviderError("Tempo limite excedido ao calcular rota.", "TIMEOUT");
      }
      throw new RouteProviderError("Motor de rotas indisponível.", "UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new RouteProviderError(`Motor de rotas respondeu HTTP ${response.status}.`, "UNAVAILABLE");
    }

    const payload = await response.json() as OsrmResponse;
    const route = payload.routes?.[0];
    if (
      payload.code !== "Ok"
      || !route
      || !Number.isFinite(route.distance)
      || !Number.isFinite(route.duration)
      || route.geometry?.type !== "LineString"
      || !isLineStringCoordinates(route.geometry.coordinates)
    ) {
      throw new RouteProviderError("Resposta inválida do motor de rotas.", "INVALID_RESPONSE");
    }

    return {
      distanceMeters: route.distance!,
      durationSeconds: route.duration!,
      geometry: {
        type: "LineString",
        coordinates: route.geometry.coordinates,
      },
      provider: this.name,
    };
  }
}
