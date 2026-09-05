import { describe, expect, it } from "vitest";
import type { RouteProvider } from "@shared/gis";
import { rankTeamCandidates } from "./gisService";

describe("rankTeamCandidates", () => {
  it("pré-seleciona por distância e ordena candidatos roteados por ETA", async () => {
    const provider: RouteProvider = {
      name: "fake",
      async calculateRoute(request) {
        const durationSeconds = request.origin.longitude < -48.95 ? 90 : 180;
        return {
          distanceMeters: durationSeconds * 5,
          durationSeconds,
          geometry: { type: "LineString", coordinates: [[request.origin.longitude, request.origin.latitude], [request.destination.longitude, request.destination.latitude]] },
          provider: "fake",
        };
      },
    };

    const result = await rankTeamCandidates(
      { latitude: -27.1, longitude: -48.91 },
      [
        { teamId: 1, code: "EQ-1", name: "Equipe 1", status: "disponivel", position: { latitude: -27.11, longitude: -48.92 } },
        { teamId: 2, code: "EQ-2", name: "Equipe 2", status: "disponivel", position: { latitude: -27.12, longitude: -48.96 } },
      ],
      provider,
      2,
    );

    expect(result[0].teamId).toBe(2);
    expect(result[0].route?.durationSeconds).toBe(90);
    expect(result[1].route?.durationSeconds).toBe(180);
  });

  it("preserva candidato por distância quando o motor de rota falha", async () => {
    const provider: RouteProvider = {
      name: "fake",
      async calculateRoute() {
        throw new Error("offline");
      },
    };

    const result = await rankTeamCandidates(
      { latitude: -27.1, longitude: -48.91 },
      [{ teamId: 1, code: "EQ-1", name: "Equipe 1", status: "disponivel", position: { latitude: -27.11, longitude: -48.92 } }],
      provider,
    );

    expect(result).toHaveLength(1);
    expect(result[0].route).toBeUndefined();
    expect(result[0].routeError).toBe("offline");
    expect(result[0].straightLineDistanceMeters).toBeGreaterThan(0);
  });
});
