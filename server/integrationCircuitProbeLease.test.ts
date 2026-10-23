import { describe, expect, it } from "vitest";
import {
  buildIntegrationCircuitProbeLeaseClaim,
  buildIntegrationCircuitProbeLeaseRelease,
  assertIntegrationCircuitProbeLeaseSnapshot,
  type IntegrationCircuitProbeLeaseSnapshot,
} from "./integrationCircuitProbeLease";

const base = (overrides: Partial<IntegrationCircuitProbeLeaseSnapshot> = {}): IntegrationCircuitProbeLeaseSnapshot => ({
  organizationId: 7,
  system: "neo",
  circuitState: "half_open",
  circuitVersion: 4,
  leaseOwner: null,
  leaseToken: null,
  leaseExpiresAtMs: null,
  ...overrides,
});

describe("D-012J J27 — lease fenced de probe por tenant/sistema", () => {
  it("adquire lease somente em half-open e incrementa versão", () => {
    const next = buildIntegrationCircuitProbeLeaseClaim(base(), {
      nowEpochMs: 10_000,
      leaseOwner: "worker-a",
      leaseToken: "token-a",
      leaseDurationMs: 5_000,
    });
    expect(next).toEqual(expect.objectContaining({
      organizationId: 7,
      system: "neo",
      circuitState: "half_open",
      circuitVersion: 5,
      leaseOwner: "worker-a",
      leaseToken: "token-a",
      leaseExpiresAtMs: 15_000,
      permitsProbe: false,
    }));
  });

  it("permite substituir lease expirado, nunca lease ainda ativo", () => {
    const expired = base({
      circuitVersion: 5,
      leaseOwner: "worker-old",
      leaseToken: "old-token",
      leaseExpiresAtMs: 9_000,
    });
    expect(() => buildIntegrationCircuitProbeLeaseClaim({
      ...expired,
      leaseExpiresAtMs: 11_000,
    }, {
      nowEpochMs: 10_000, leaseOwner: "worker-b",
      leaseToken: "token-b", leaseDurationMs: 5_000,
    })).toThrow(/ativo/i);
    const next = buildIntegrationCircuitProbeLeaseClaim(expired, {
      nowEpochMs: 10_000, leaseOwner: "worker-b",
      leaseToken: "token-b", leaseDurationMs: 5_000,
    });
    expect(next.leaseOwner).toBe("worker-b");
    expect(next.circuitVersion).toBe(6);
  });

  it("libera somente com token e versão atuais", () => {
    const leased = base({
      circuitVersion: 5,
      leaseOwner: "worker-a",
      leaseToken: "token-a",
      leaseExpiresAtMs: 15_000,
    });
    expect(() => buildIntegrationCircuitProbeLeaseRelease(leased, {
      nowEpochMs: 12_000,
      expectedVersion: 4,
      leaseToken: "token-a",
    })).toThrow(/versão/i);
    expect(() => buildIntegrationCircuitProbeLeaseRelease(leased, {
      nowEpochMs: 12_000,
      expectedVersion: 5,
      leaseToken: "stale",
    })).toThrow(/token/i);
    const next = buildIntegrationCircuitProbeLeaseRelease(leased, {
      nowEpochMs: 12_000,
      expectedVersion: 5,
      leaseToken: "token-a",
    });
    expect(next).toEqual(expect.objectContaining({
      circuitVersion: 6,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAtMs: null,
      permitsProbe: false,
    }));
  });

  it("falha fechado fora de half-open e para snapshot parcial", () => {
    expect(() => buildIntegrationCircuitProbeLeaseClaim(base({ circuitState: "open" }), {
      nowEpochMs: 10_000, leaseOwner: "worker-a",
      leaseToken: "token-a", leaseDurationMs: 5_000,
    })).toThrow(/half-open/i);
    expect(() => assertIntegrationCircuitProbeLeaseSnapshot(base({
      leaseOwner: "worker-a",
      leaseToken: null,
      leaseExpiresAtMs: 15_000,
    }))).toThrow(/lease/i);
  });
});
