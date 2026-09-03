import { describe, expect, it, vi } from "vitest";
import { OsrmRouteProvider, RouteProviderError } from "./routingProvider";

describe("OsrmRouteProvider", () => {
  it("normaliza rota OSRM em contrato GeoJSON independente do provedor", async () => {
    const fakeFetch = vi.fn(async () => new Response(JSON.stringify({
      code: "Ok",
      routes: [{
        distance: 1250,
        duration: 180,
        geometry: {
          type: "LineString",
          coordinates: [[-48.91, -27.1], [-48.92, -27.11]],
        },
      }],
    }), { status: 200 }));

    const provider = new OsrmRouteProvider("https://osrm.example", fakeFetch as typeof fetch, 1000);
    const result = await provider.calculateRoute({
      origin: { latitude: -27.1, longitude: -48.91 },
      destination: { latitude: -27.11, longitude: -48.92 },
    });

    expect(result.provider).toBe("osrm");
    expect(result.distanceMeters).toBe(1250);
    expect(result.durationSeconds).toBe(180);
    expect(result.geometry.type).toBe("LineString");
  });

  it("bloqueia coordenadas inválidas antes de chamar o provedor", async () => {
    const fakeFetch = vi.fn();
    const provider = new OsrmRouteProvider("https://osrm.example", fakeFetch as typeof fetch);

    await expect(provider.calculateRoute({
      origin: { latitude: -95, longitude: -48.91 },
      destination: { latitude: -27.11, longitude: -48.92 },
    })).rejects.toMatchObject<RouteProviderError>({ code: "INVALID_POINT" });

    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("converte falha de rede em indisponibilidade controlada", async () => {
    const fakeFetch = vi.fn(async () => { throw new Error("offline"); });
    const provider = new OsrmRouteProvider("https://osrm.example", fakeFetch as typeof fetch);

    await expect(provider.calculateRoute({
      origin: { latitude: -27.1, longitude: -48.91 },
      destination: { latitude: -27.11, longitude: -48.92 },
    })).rejects.toMatchObject<RouteProviderError>({ code: "UNAVAILABLE" });
  });
});
