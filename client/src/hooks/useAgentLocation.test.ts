import { describe, expect, it } from "vitest";
import { shouldReportLocation } from "./useAgentLocation";

describe("cadência de localização do agente", () => {
  it("envia a primeira posição disponível", () => {
    expect(shouldReportLocation(0, 20_000)).toBe(true);
  });

  it("evita reenvio antes da cadência mínima", () => {
    expect(shouldReportLocation(30_000, 49_999)).toBe(false);
  });

  it("permite novo envio ao atingir vinte segundos", () => {
    expect(shouldReportLocation(30_000, 50_000)).toBe(true);
  });
});
