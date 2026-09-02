import { describe, expect, it } from "vitest";
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

  it("usa CARTO como contingência do roadmap quando o OpenStreetMap falha", () => {
    expect(resolveTileLayer("roadmap", true).url).toContain("basemaps.cartocdn.com");
    expect(resolveTileLayer("roadmap", true).name).toContain("CARTO");
  });

  it("não tem contingência para satélite/terreno e mantém a camada primária", () => {
    expect(resolveTileLayer("satellite", true)).toEqual(resolveTileLayer("satellite", false));
    expect(resolveTileLayer("terrain", true)).toEqual(resolveTileLayer("terrain", false));
  });

  it("permite selecionar CARTO diretamente como tipo de mapa, com OpenStreetMap como contingência", () => {
    expect(resolveTileLayer("carto").url).toContain("basemaps.cartocdn.com");
    expect(resolveTileLayer("carto", true).url).toContain("tile.openstreetmap.org");
  });
});
