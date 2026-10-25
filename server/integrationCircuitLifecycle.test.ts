import { describe, expect, it } from "vitest";
import {
  createIntegrationCircuitCoordinator,
  type IntegrationCircuitCoordinatorStorage,
} from "./integrationCircuitCoordinator";
import type { IntegrationCircuitPersistenceSnapshot } from "./integrationCircuitMySqlStorage";

function mutableStorage(initial: IntegrationCircuitPersistenceSnapshot) {
  let state = { ...initial };
  const actions: string[] = [];
  const storage: IntegrationCircuitCoordinatorStorage = {
    async load(input) {
      if (state.organizationId !== input.organizationId || state.system !== input.system) return null;
      return { ...state };
    },
    async commitAudited(input) {
      if (
        state.organizationId !== input.organizationId
        || state.system !== input.system
        || state.version !== input.expectedVersion
      ) return false;
      state = { ...input.next };
      actions.push(input.action);
      return true;
    },
  };
  return { storage, snapshot: () => ({ ...state }), actions };
}

const closed: IntegrationCircuitPersistenceSnapshot = {
  organizationId: 7,
  system: "neo",
  state: "closed",
  version: 1,
  consecutiveFailures: 0,
  openedAtMs: null,
  cooldownUntilMs: null,
  leaseOwner: null,
  leaseToken: null,
  leaseExpiresAtMs: null,
};

describe("D-012J J30 — prova de ciclo completo do circuit breaker persistente", () => {
  it("compõe J26–J29 do closed até half-open e fecha após probe confiável", async () => {
    let now = 1_000;
    const store = mutableStorage(closed);
    const circuit = createIntegrationCircuitCoordinator(store.storage, () => now);

    await circuit.recordFailure({
      organizationId: 7, system: "neo", expectedVersion: 1,
      failureThreshold: 2, cooldownSeconds: 30,
    });
    expect(store.snapshot()).toMatchObject({ state: "closed", version: 2, consecutiveFailures: 1 });

    await circuit.recordFailure({
      organizationId: 7, system: "neo", expectedVersion: 2,
      failureThreshold: 2, cooldownSeconds: 30,
    });
    expect(store.snapshot()).toMatchObject({
      state: "open", version: 3, consecutiveFailures: 2,
      openedAtMs: 1_000, cooldownUntilMs: 31_000,
    });

    now = 31_000;
    const halfOpen = await circuit.advanceCooldown({
      organizationId: 7, system: "neo", expectedVersion: 3,
    });
    expect(halfOpen).toMatchObject({ state: "half_open", version: 4, permitsProbe: false });

    now = 32_000;
    const leased = await circuit.claimProbeLease({
      organizationId: 7, system: "neo", expectedVersion: 4,
      leaseOwner: "trusted-runner", leaseToken: "opaque-j30", leaseDurationMs: 5_000,
    });
    expect(leased).toMatchObject({
      state: "half_open", version: 5, leaseOwner: "trusted-runner",
      leaseToken: "opaque-j30", leaseExpiresAtMs: 37_000, permitsProbe: false,
    });

    now = 33_000;
    const resolved = await circuit.resolveProbe({
      organizationId: 7, system: "neo", expectedVersion: 5,
      leaseToken: "opaque-j30", outcome: "success", cooldownSeconds: 30,
    });
    expect(resolved).toMatchObject({
      state: "closed", version: 6, consecutiveFailures: 0,
      leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
      permitsExternalCall: false, permitsProbe: false, permitsAutomaticReplay: false,
    });
    expect(store.actions).toEqual([
      "integration.circuit.failure.recorded",
      "integration.circuit.failure.recorded",
      "integration.circuit.cooldown.expired",
      "integration.circuit.probe_lease.claimed",
      "integration.circuit.probe.succeeded",
    ]);
  });

  it("reabre após probe confiável com falha e preserva bloqueios de efeitos externos", async () => {
    let now = 10_000;
    const store = mutableStorage({
      ...closed,
      state: "half_open",
      version: 8,
      consecutiveFailures: 4,
      openedAtMs: 1_000,
      cooldownUntilMs: 9_000,
      leaseOwner: "trusted-runner",
      leaseToken: "opaque-failure",
      leaseExpiresAtMs: 20_000,
    });
    const circuit = createIntegrationCircuitCoordinator(store.storage, () => now);
    const result = await circuit.resolveProbe({
      organizationId: 7, system: "neo", expectedVersion: 8,
      leaseToken: "opaque-failure", outcome: "failure", cooldownSeconds: 45,
    });

    expect(result).toMatchObject({
      state: "open", version: 9, consecutiveFailures: 5,
      openedAtMs: 10_000, cooldownUntilMs: 55_000,
      leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
      permitsExternalCall: false, permitsProbe: false, permitsAutomaticReplay: false,
    });
  });

  it("falha fechado quando tenant ou sistema não correspondem ao estado persistido", async () => {
    const store = mutableStorage(closed);
    const circuit = createIntegrationCircuitCoordinator(store.storage, () => 1_000);
    await expect(circuit.recordFailure({
      organizationId: 8, system: "neo", expectedVersion: 1,
      failureThreshold: 2, cooldownSeconds: 30,
    })).rejects.toThrow(/não encontrado|escopo|tenant/i);
    await expect(circuit.recordFailure({
      organizationId: 7, system: "crm", expectedVersion: 1,
      failureThreshold: 2, cooldownSeconds: 30,
    })).rejects.toThrow(/não encontrado|escopo|sistema/i);
    expect(store.snapshot()).toEqual(closed);
  });
});
