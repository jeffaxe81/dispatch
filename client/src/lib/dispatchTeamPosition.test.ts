import {describe, expect, it} from "vitest";
import {parseDispatchCoordinates} from "./dispatchTeamPosition";
describe("AXED-F060 — elegibilidade cartográfica para despacho", () => {
  it("não interpreta latitude nula ou string vazia como zero", () => {
    expect(parseDispatchCoordinates(null, "-48.4")).toBeNull();
    expect(parseDispatchCoordinates("", "-48.4")).toBeNull();
    expect(parseDispatchCoordinates(" ", "-48.4")).toBeNull();
    expect(parseDispatchCoordinates("-27.2", null)).toBeNull();
    expect(parseDispatchCoordinates("-27.2", "")).toBeNull();
  });
  it("não permite não numérico, infinito ou fora dos limites geográficos", () => {
    expect(parseDispatchCoordinates("N/A", "-48.4")).toBeNull();
    expect(parseDispatchCoordinates("91", "0")).toBeNull();
    expect(parseDispatchCoordinates("-27.2", "-181")).toBeNull();
    expect(parseDispatchCoordinates(Infinity, "-48.4")).toBeNull();
  });
  it("preserva coordenadas válidas, inclusive zero real explicitamente informado", () => {
    expect(parseDispatchCoordinates("-27.1123456","-48.5123456")).toEqual({latitude:-27.1123456,longitude:-48.5123456});
    expect(parseDispatchCoordinates("0","0")).toEqual({latitude:0,longitude:0});
  });
});
