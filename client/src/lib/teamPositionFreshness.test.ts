import { describe, expect, it } from "vitest";
import { evaluateTeamPositionFreshness, summarizeTeamPositionFreshness } from "./teamPositionFreshness";

const now = new Date("2026-10-31T20:00:00.000Z");
const base = { lastLatitude: "-27.12", lastLongitude: "-48.45", lastLocationAt: "2026-10-31T19:56:00.000Z" };

describe("AXED-F058 — alerta de localização desatualizada", () => {
  it("classifica posição recente e vencida pelo limiar configurado, sem alterar a entrada", () => {
    expect(evaluateTeamPositionFreshness(base, now, 5)).toBe("current");
    expect(evaluateTeamPositionFreshness(base, now, 3)).toBe("stale");
    expect(base.lastLocationAt).toBe("2026-10-31T19:56:00.000Z");
  });
  it("diferencia timestamp desconhecido de posição vencida", () => {
    expect(evaluateTeamPositionFreshness({ ...base, lastLocationAt: null }, now, 5)).toBe("unknown");
    expect(evaluateTeamPositionFreshness({ ...base, lastLocationAt: "invalid" }, now, 5)).toBe("unknown");
    expect(evaluateTeamPositionFreshness({ ...base, lastLocationAt: "2026-11-01T00:00:00Z" }, now, 5)).toBe("unknown");
  });
  it("sem coordenadas válidas não finge que a equipe está posicionada", () => {
    expect(evaluateTeamPositionFreshness({ ...base, lastLatitude: null }, now, 5)).toBe("unavailable");
    expect(evaluateTeamPositionFreshness({ ...base, lastLongitude: "181" }, now, 5)).toBe("unavailable");
    expect(evaluateTeamPositionFreshness({ ...base, lastLatitude: "91" }, now, 5)).toBe("unavailable");
    expect(evaluateTeamPositionFreshness({ ...base, lastLatitude: "NaN" }, now, 5)).toBe("unavailable");
  });
  it("aceita exatamente o limiar e marca vencido somente depois do limiar", () => {
    expect(evaluateTeamPositionFreshness(base, now, 4)).toBe("current");
    expect(evaluateTeamPositionFreshness({ ...base, lastLocationAt: "2026-10-31T19:55:59.999Z" }, now, 4)).toBe("stale");
  });
  it("nega configurações fora do intervalo", () => {
    for (const invalid of [0, -1, 1441, NaN, Infinity, 2.5]) {
      expect(() => evaluateTeamPositionFreshness(base, now, invalid)).toThrow();
    }
  });
  it("agrega somente as equipes da coleção já autorizada e diferencia ausência", () => {
    expect(summarizeTeamPositionFreshness([
      base,
      { ...base, lastLocationAt: "2026-10-31T19:00:00Z" },
      { ...base, lastLocationAt: null },
      { ...base, lastLongitude: null },
    ], now, 5)).toEqual({ current: 1, stale: 1, unknown: 1, unavailable: 1 });
  });
});
