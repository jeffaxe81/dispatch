import { describe, expect, it } from "vitest";
import { resolveOperationalMapMode } from "./OperationalMap";

describe("modo de mapa operacional", () => {
  it("usa OpenStreetMap automaticamente somente após falha do Google Maps", () => {
    expect(resolveOperationalMapMode("automatic", false).useOpenStreetMap).toBe(false);
    expect(resolveOperationalMapMode("automatic", true).useOpenStreetMap).toBe(true);
  });

  it("mantém OpenStreetMap ativo quando configurado manualmente", () => {
    expect(resolveOperationalMapMode("openstreetmap", false).useOpenStreetMap).toBe(true);
  });

  it("informa indisponibilidade sem fallback no modo somente Google", () => {
    const result = resolveOperationalMapMode("google_only", true);
    expect(result.useOpenStreetMap).toBe(false);
    expect(result.showGoogleOnlyUnavailable).toBe(true);
  });
});
