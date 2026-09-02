import { afterEach, describe, expect, it, vi } from "vitest";
import { asPoint, resolveTileLayer } from "./LeafletMap";

describe("mapa interativo OpenStreetMap", () => {
  it("aceita coordenadas numéricas ou em texto e rejeita valores inválidos", () => {
    expect(asPoint({ latitude: "-27.1", longitude: "-48.91" })).toEqual({ lat: -27.1, lng: -48.91 });
    expect(asPoint({ latitude: -27.1, longitude: -48.91 })).toEqual({ lat: -27.1, lng: -48.91 });
    expect(asPoint({ latitude: undefined as unknown as null, longitude: "-48.91" })).toBeNull();
    expect(asPoint({ latitude: "não é número", longitude: "-48.91" })).toBeNull();
  });

  it("resolve a camada de tiles gratuita e sem chave de API para cada tipo de mapa", () => {
    expect(resolveTileLayer("roadmap").url).toContain("tile.openstreetmap.org");
    expect(resolveTileLayer("terrain").url).toContain("opentopomap.org");
    expect(resolveTileLayer("satellite").url).toContain("arcgisonline.com");
    expect(resolveTileLayer("hybrid").url).toContain("arcgisonline.com");
  });

  it("usa o mapa padrão (roadmap) quando o tipo não é reconhecido", () => {
    expect(resolveTileLayer(undefined)).toEqual(resolveTileLayer("roadmap"));
  });

  it("não tem contingência para satélite/terreno e mantém a camada primária", () => {
    expect(resolveTileLayer("satellite", true)).toEqual(resolveTileLayer("satellite", false));
    expect(resolveTileLayer("terrain", true)).toEqual(resolveTileLayer("terrain", false));
  });
});

// CARTO's basemap tiles require a free API key (their 2024 policy change).
// Without VITE_CARTO_API_KEY configured, everything must degrade to the
// free, keyless OpenStreetMap instead of requesting CARTO tiles that would
// just fail without a key.
describe("CARTO sem chave de API configurada", () => {
  it("nunca é usado como contingência do roadmap sem uma chave", async () => {
    vi.resetModules();
    const { resolveTileLayer, CARTO_AVAILABLE } = await import("./LeafletMap");
    expect(CARTO_AVAILABLE).toBe(false);
    expect(resolveTileLayer("roadmap", true).url).toContain("tile.openstreetmap.org");
  });

  it("selecionar CARTO diretamente se comporta como OpenStreetMap em vez de mostrar um mapa quebrado", async () => {
    vi.resetModules();
    const { resolveTileLayer } = await import("./LeafletMap");
    expect(resolveTileLayer("carto").url).toContain("tile.openstreetmap.org");
  });
});

describe("CARTO com chave de API configurada", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa CARTO como contingência do roadmap quando o OpenStreetMap falha", async () => {
    vi.stubEnv("VITE_CARTO_API_KEY", "chave-de-teste");
    vi.resetModules();
    const { resolveTileLayer, CARTO_AVAILABLE } = await import("./LeafletMap");
    expect(CARTO_AVAILABLE).toBe(true);
    expect(resolveTileLayer("roadmap", true).url).toContain("basemaps.cartocdn.com");
    expect(resolveTileLayer("roadmap", true).url).toContain("key=chave-de-teste");
    expect(resolveTileLayer("roadmap", true).name).toContain("CARTO");
  });

  it("permite selecionar CARTO diretamente como tipo de mapa, com OpenStreetMap como contingência", async () => {
    vi.stubEnv("VITE_CARTO_API_KEY", "chave-de-teste");
    vi.resetModules();
    const { resolveTileLayer } = await import("./LeafletMap");
    expect(resolveTileLayer("carto").url).toContain("basemaps.cartocdn.com");
    expect(resolveTileLayer("carto", true).url).toContain("tile.openstreetmap.org");
  });
});
