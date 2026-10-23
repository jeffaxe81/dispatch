import { describe, expect, it } from "vitest";
import {
  buildIntegrationCircuitFailure,
  buildIntegrationCircuitCooldownExpiry,
  buildIntegrationCircuitSuccess,
  assertIntegrationCircuitSnapshot,
  type IntegrationCircuitSnapshot,
} from "./integrationCircuitState";

const base = (overrides: Partial<IntegrationCircuitSnapshot> = {}): IntegrationCircuitSnapshot => ({
  organizationId: 7,
  system: "neo",
  state: "closed",
  version: 3,
  consecutiveFailures: 1,
  openedAtMs: null,
  cooldownUntilMs: null,
  ...overrides,
});

describe("D-012J J26 — estado persistente do circuit breaker", () => {
  it("abre o circuito no threshold e preserva tenant+sistema", () => {
    const next = buildIntegrationCircuitFailure(base({ consecutiveFailures: 2 }), {
      nowEpochMs: 1_000,
      failureThreshold: 3,
      cooldownSeconds: 30,
    });
    expect(next).toEqual(expect.objectContaining({
      organizationId: 7, system: "neo", state: "open", version: 4,
      consecutiveFailures: 3, openedAtMs: 1_000, cooldownUntilMs: 31_000,
    }));
  });

  it("mantém fechado antes do threshold sem fabricar autorização", () => {
    const next = buildIntegrationCircuitFailure(base(), {
      nowEpochMs: 1_000, failureThreshold: 3, cooldownSeconds: 30,
    });
    expect(next.state).toBe("closed");
    expect(next.consecutiveFailures).toBe(2);
    expect(next.version).toBe(4);
  });

  it("só muda open para half_open após cooldown e sem autorizar probe", () => {
    const current = base({
      state: "open", consecutiveFailures: 3,
      openedAtMs: 1_000, cooldownUntilMs: 31_000,
    });
    expect(() => buildIntegrationCircuitCooldownExpiry(current, 30_999))
      .toThrow(/cooldown/i);
    const next = buildIntegrationCircuitCooldownExpiry(current, 31_000);
    expect(next).toEqual(expect.objectContaining({
      state: "half_open", version: 4,
      consecutiveFailures: 3, openedAtMs: 1_000, cooldownUntilMs: 31_000,
      permitsProbe: false,
    }));
  });

  it("fecha e zera contador somente após sucesso confiável", () => {
    const current = base({
      state: "half_open", consecutiveFailures: 4,
      openedAtMs: 1_000, cooldownUntilMs: 31_000,
    });
    const next = buildIntegrationCircuitSuccess(current, 32_000);
    expect(next).toEqual(expect.objectContaining({
      state: "closed", version: 4, consecutiveFailures: 0,
      openedAtMs: null, cooldownUntilMs: null,
    }));
  });

  it("falha fechado para snapshot contraditório ou tenant inválido", () => {
    expect(() => assertIntegrationCircuitSnapshot(base({ organizationId: 0 })))
      .toThrow(/organiza/i);
    expect(() => assertIntegrationCircuitSnapshot(base({
      state: "closed", openedAtMs: 1_000,
    }))).toThrow(/fechado/i);
  });
});
