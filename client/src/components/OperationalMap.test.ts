import { describe, expect, it } from "vitest";
import { resolveContingencyEnabled } from "./OperationalMap";

describe("contingência do mapa operacional", () => {
  it('ativa a contingência automática para CARTO no modo "automatic" (padrão)', () => {
    expect(resolveContingencyEnabled("automatic")).toBe(true);
  });

  it('desativa a contingência quando o modo é "openstreetmap"', () => {
    expect(resolveContingencyEnabled("openstreetmap")).toBe(false);
  });
});
