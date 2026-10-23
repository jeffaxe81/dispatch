import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIntegrationCircuitCoordinator,
  type IntegrationCircuitCoordinatorStorage,
} from "./integrationCircuitCoordinator";
import type { IntegrationCircuitPersistenceSnapshot } from "./integrationCircuitMySqlStorage";
import { createIntegrationProbeExecutor } from "./integrationProbeExecutor";

function store(initial: IntegrationCircuitPersistenceSnapshot) {
  let state = { ...initial };
  const storage: IntegrationCircuitCoordinatorStorage = {
    async load(input) {
      if (state.organizationId !== input.organizationId || state.system !== input.system) return null;
      return { ...state };
    },
    async commitAudited(input) {
      if (state.version !== input.expectedVersion) return false;
      state = { ...input.next };
      return true;
    },
  };
  return { storage, snapshot: () => ({ ...state }) };
}

const authorized: IntegrationCircuitPersistenceSnapshot = {
  organizationId: 7,
  system: "neo",
  state: "half_open",
  version: 7,
  consecutiveFailures: 3,
  openedAtMs: 1_000,
  cooldownUntilMs: 31_000,
  leaseOwner: "trusted-runner",
  leaseToken: "lease-j32",
  leaseExpiresAtMs: 60_000,
  executionToken: "exec-j32",
  executionExpiresAtMs: 50_000,
  executionConsumedAtMs: null,
};

const original = {
  runtime: process.env.AXE_RUNTIME_ENV,
  enabled: process.env.AXE_INTEGRATION_PROBE_J32_ENABLED,
};

afterEach(() => {
  if (original.runtime === undefined) delete process.env.AXE_RUNTIME_ENV;
  else process.env.AXE_RUNTIME_ENV = original.runtime;
  if (original.enabled === undefined) delete process.env.AXE_INTEGRATION_PROBE_J32_ENABLED;
  else process.env.AXE_INTEGRATION_PROBE_J32_ENABLED = original.enabled;
});

function enable() {
  process.env.AXE_RUNTIME_ENV = "homologation";
  process.env.AXE_INTEGRATION_PROBE_J32_ENABLED = "true";
}

describe("D-012J J32 — executor isolado de probe em homologação", () => {
  it("consome o grant one-shot antes do callback e resolve sucesso sem expor tokens ao adapter", async () => {
    enable();
    let now = 41_000;
    const state = store(authorized);
    const circuit = createIntegrationCircuitCoordinator(state.storage, () => now);
    const probe = vi.fn(async (input: { organizationId: number; system: string }) => {
      expect(input).toEqual({ organizationId: 7, system: "neo" });
      return "success" as const;
    });
    const executor = createIntegrationProbeExecutor({ circuit, probe });

    const result = await executor.execute({
      organizationId: 7,
      system: "neo",
      expectedVersion: 7,
      leaseToken: "lease-j32",
      executionToken: "exec-j32",
      cooldownSeconds: 30,
    });

    expect(probe).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      state: "closed",
      version: 9,
      permitsExternalCall: false,
      permitsProbe: false,
      permitsAutomaticReplay: false,
    });
    expect(state.snapshot()).toMatchObject({
      state: "closed",
      version: 9,
      leaseToken: null,
      executionToken: null,
    });

    await expect(executor.execute({
      organizationId: 7,
      system: "neo",
      expectedVersion: 7,
      leaseToken: "lease-j32",
      executionToken: "exec-j32",
      cooldownSeconds: 30,
    })).rejects.toThrow(/versão|CAS|consum/i);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("falha fechado quando o adapter lança erro e não reutiliza o grant consumido", async () => {
    enable();
    const state = store(authorized);
    const circuit = createIntegrationCircuitCoordinator(state.storage, () => 41_000);
    const probe = vi.fn(async () => { throw new Error("timeout incerto"); });
    const executor = createIntegrationProbeExecutor({ circuit, probe });

    await expect(executor.execute({
      organizationId: 7,
      system: "neo",
      expectedVersion: 7,
      leaseToken: "lease-j32",
      executionToken: "exec-j32",
      cooldownSeconds: 30,
    })).rejects.toThrow(/timeout incerto/);

    expect(state.snapshot()).toMatchObject({
      state: "half_open",
      version: 8,
      executionConsumedAtMs: 41_000,
      leaseToken: "lease-j32",
    });

    await expect(executor.execute({
      organizationId: 7,
      system: "neo",
      expectedVersion: 8,
      leaseToken: "lease-j32",
      executionToken: "exec-j32",
      cooldownSeconds: 30,
    })).rejects.toThrow(/consumid|one-shot/i);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("permanece desabilitado fora do opt-in de homologação e não toca no circuito nem no adapter", async () => {
    delete process.env.AXE_INTEGRATION_PROBE_J32_ENABLED;
    process.env.AXE_RUNTIME_ENV = "homologation";
    const state = store(authorized);
    const circuit = createIntegrationCircuitCoordinator(state.storage, () => 41_000);
    const probe = vi.fn(async () => "success" as const);
    const executor = createIntegrationProbeExecutor({ circuit, probe });

    await expect(executor.execute({
      organizationId: 7,
      system: "neo",
      expectedVersion: 7,
      leaseToken: "lease-j32",
      executionToken: "exec-j32",
      cooldownSeconds: 30,
    })).rejects.toThrow(/desabilitad|homologa/i);

    expect(probe).not.toHaveBeenCalled();
    expect(state.snapshot()).toEqual(authorized);
  });
});
