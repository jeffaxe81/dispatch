import { describe, expect, it } from "vitest";
import { resolveDisplayPlacement } from "./displayPlacement";

const displays = [
  { label: "Monitor principal", left: 0, top: 0, width: 1920, height: 1080 },
  { label: "Mapa", left: 1920, top: 0, width: 2560, height: 1440 },
  { label: "Supervisão", left: -1920, top: 0, width: 1920, height: 1080 },
];

describe("displayPlacement", () => {
  it("resolve a dica por ordinal sem persistir identificador físico", () => {
    expect(resolveDisplayPlacement({ ordinal: 1 }, displays)).toEqual({
      left: 1920,
      top: 0,
      width: 2560,
      height: 1440,
    });
  });

  it("prefere label lógico quando disponível", () => {
    expect(resolveDisplayPlacement({ label: "Supervisão", ordinal: 1 }, displays)).toEqual({
      left: -1920,
      top: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("faz fallback seguro quando a dica não pode ser resolvida", () => {
    expect(resolveDisplayPlacement({ label: "Comunicação", ordinal: 9 }, displays)).toBeNull();
    expect(resolveDisplayPlacement(undefined, displays)).toBeNull();
    expect(resolveDisplayPlacement({ ordinal: 0 }, [])).toBeNull();
  });
});
