import { describe, expect, it } from "vitest";
import { resolveOperationalMapMode } from "./OperationalMap";

describe("modo de mapa operacional", () => {
  it("usa OpenStreetMap como provider preferencial no modo automático", () => {
    expect(resolveOperationalMapMode("automatic", false).useOpenStreetMap).toBe(true);
    expect(resolveOperationalMapMode("automatic", true).useOpenStreetMap).toBe(true);
  });

  it("mantém OpenStreetMap ativo quando configurado manualmente", () => {
    expect(resolveOperationalMapMode("openstreetmap", false).useOpenStreetMap).toBe(true);
  });

  it("mantém Google disponível apenas quando explicitamente configurado", () => {
    expect(resolveOperationalMapMode("google_only", false).useOpenStreetMap).toBe(false);
  });

  it("informa indisponibilidade sem fallback no modo somente Google", () => {
    const result = resolveOperationalMapMode("google_only", true);
    expect(result.useOpenStreetMap).toBe(false);
    expect(result.showGoogleOnlyUnavailable).toBe(true);
  });
});
