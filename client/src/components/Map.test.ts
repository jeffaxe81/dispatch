import { describe, expect, it } from "vitest";
import { canInitializeMap } from "./Map";

describe("inicialização do mapa", () => {
  it("não inicializa após o componente ser desmontado durante o carregamento do SDK", () => {
    expect(canInitializeMap({ cancelled: true, hasContainer: false, hasMapsApi: true })).toBe(false);
  });

  it("inicializa somente quando há contêiner e SDK disponíveis", () => {
    expect(canInitializeMap({ cancelled: false, hasContainer: true, hasMapsApi: true })).toBe(true);
    expect(canInitializeMap({ cancelled: false, hasContainer: true, hasMapsApi: false })).toBe(false);
  });
});
