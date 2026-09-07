import { describe, expect, it, vi } from "vitest";
import { createHealthRegistry, evaluateHealthSnapshot } from "./healthRegistry";

const definition = (overrides: Record<string, unknown> = {}) => ({
  id: "database",
  name: "Banco de dados",
  criticality: "critical" as const,
  blocksReadiness: true,
  timeoutMs: 25,
  evidenceTtlMs: 1_000,
  probe: vi.fn(async () => "healthy" as const),
  ...overrides,
});

describe("D-011A health registry", () => {
  it("rejeita definições inválidas e IDs duplicados", () => {
    expect(() => createHealthRegistry([definition({ id: "" })])).toThrow(/id/i);
    expect(() => createHealthRegistry([definition({ timeoutMs: 0 })])).toThrow(/timeout/i);
    expect(() => createHealthRegistry([definition({ evidenceTtlMs: 0 })])).toThrow(/ttl|evid/i);
    expect(() => createHealthRegistry([definition(), definition()])).toThrow(/duplic/i);
  });

  it("executa probes isolados e converte rejeição/timeout em unhealthy sem expor erro", async () => {
    const never = new Promise<never>(() => undefined);
    const registry = createHealthRegistry([
      definition(),
      definition({ id: "optional", name: "Opcional", blocksReadiness: false, criticality: "optional", probe: vi.fn(async () => "degraded") }),
      definition({ id: "rejected", name: "Rejeitado", blocksReadiness: false, criticality: "operational", probe: vi.fn(async () => { throw new Error("mysql://user:pass@host Bearer secret"); }) }),
      definition({ id: "timeout", name: "Timeout", blocksReadiness: false, criticality: "operational", timeoutMs: 5, probe: vi.fn(() => never) }),
    ]);

    const snapshot = await registry.probeAll(new Date("2026-09-07T16:00:00.000Z"));
    expect(snapshot.components.map(component => [component.id, component.state])).toEqual([
      ["database", "healthy"],
      ["optional", "degraded"],
      ["rejected", "unhealthy"],
      ["timeout", "unhealthy"],
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/mysql:\/\/|Bearer secret|user:pass/);
  });

  it("agrega readiness e trata evidência expirada como unknown", async () => {
    const registry = createHealthRegistry([
      definition(),
      definition({ id: "optional", name: "Opcional", blocksReadiness: false, criticality: "optional", probe: vi.fn(async () => "degraded") }),
    ]);
    const snapshot = await registry.probeAll(new Date("2026-09-07T16:00:00.000Z"));
    expect(snapshot.status).toBe("degraded");

    const stale = evaluateHealthSnapshot(registry.definitions, snapshot.components, new Date("2026-09-07T16:00:02.000Z"));
    expect(stale.components.find(component => component.id === "database")?.state).toBe("unknown");
    expect(stale.status).toBe("not_ready");
  });
});
