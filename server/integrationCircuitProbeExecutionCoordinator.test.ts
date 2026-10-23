import { describe, expect, it } from "vitest";
import {
  createIntegrationCircuitCoordinator,
  IntegrationCircuitCoordinatorConflictError,
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
      if (state.version !== input.expectedVersion) return false;
      state = { ...input.next };
      actions.push(input.action);
      return true;
    },
  };
  return { storage, snapshot: () => ({ ...state }), actions };
}

const leased = {
  organizationId: 7,
  system: "neo" as const,
  state: "half_open" as const,
  version: 6,
  consecutiveFailures: 3,
  openedAtMs: 1_000,
  cooldownUntilMs: 31_000,
  leaseOwner: "trusted-runner",
  leaseToken: "lease-j31",
  leaseExpiresAtMs: 50_000,
  executionToken: null,
  executionExpiresAtMs: null,
  executionConsumedAtMs: null,
} as IntegrationCircuitPersistenceSnapshot;

describe("D-012J J31 — coordinator da intenção one-shot", () => {
  it("persiste emissão sem autorizar probe e consumo concede uma única autorização", async () => {
    let now = 40_000;
    const store = mutableStorage(leased);
    const circuit = createIntegrationCircuitCoordinator(store.storage, () => now);

    const issued = await circuit.issueProbeExecutionIntent({
      organizationId: 7,
      system: "neo",
      expectedVersion: 6,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
      executionDurationMs: 5_000,
    });
    expect(issued).toMatchObject({
      version: 7,
      executionToken: "exec-j31",
      executionConsumedAtMs: null,
      permitsProbe: false,
    });

    now = 41_000;
    const consumed = await circuit.consumeProbeExecutionIntent({
      organizationId: 7,
      system: "neo",
      expectedVersion: 7,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
    });
    expect(consumed).toMatchObject({
      version: 8,
      executionConsumedAtMs: 41_000,
      permitsProbe: true,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(store.actions).toEqual([
      "integration.circuit.probe_intent.issued",
      "integration.circuit.probe_intent.consumed",
    ]);

    await expect(circuit.consumeProbeExecutionIntent({
      organizationId: 7,
      system: "neo",
      expectedVersion: 8,
      leaseToken: "lease-j31",
      executionToken: "exec-j31",
    })).rejects.toThrow(/consumid|one-shot/i);
  });

  it("limpa intenção ao liberar lease sem executar probe", async () => {
    const store = mutableStorage({
      ...leased,
      version: 7,
      executionToken: "exec-j31",
      executionExpiresAtMs: 45_000,
      executionConsumedAtMs: null,
    } as IntegrationCircuitPersistenceSnapshot);
    const circuit = createIntegrationCircuitCoordinator(store.storage, () => 42_000);
    const released = await circuit.releaseProbeLease({
      organizationId: 7,
      system: "neo",
      expectedVersion: 7,
      leaseToken: "lease-j31",
    });
    expect(released).toMatchObject({
      version: 8,
      leaseToken: null,
      executionToken: null,
      executionExpiresAtMs: null,
      executionConsumedAtMs: null,
      permitsProbe: false,
    });
  });
});
