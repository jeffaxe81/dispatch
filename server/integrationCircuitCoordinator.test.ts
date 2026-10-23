import { describe, expect, it, vi } from "vitest";
import {
  createIntegrationCircuitCoordinator,
  IntegrationCircuitCoordinatorConflictError,
  type IntegrationCircuitCoordinatorStorage,
} from "./integrationCircuitCoordinator";

const base = {
  organizationId: 7,
  system: "neo" as const,
  state: "closed" as const,
  version: 2,
  consecutiveFailures: 1,
  openedAtMs: null,
  cooldownUntilMs: null,
  leaseOwner: null,
  leaseToken: null,
  leaseExpiresAtMs: null,
};

function storage(overrides: Partial<IntegrationCircuitCoordinatorStorage> = {}): IntegrationCircuitCoordinatorStorage {
  return {
    load: vi.fn(async () => ({ ...base })),
    commitAudited: vi.fn(async () => true),
    ...overrides,
  };
}

describe("D-012J J28 — coordenador CAS/auditoria do circuito", () => {
  it("registra falha usando estado persistido e auditoria sanitizada", async () => {
    const s = storage();
    const c = createIntegrationCircuitCoordinator(s, () => 1_000);
    const result = await c.recordFailure({
      organizationId: 7, system: "neo", expectedVersion: 2,
      failureThreshold: 3, cooldownSeconds: 30,
    });
    expect(result).toMatchObject({ version: 3, consecutiveFailures: 2, state: "closed" });
    expect(s.commitAudited).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 7, system: "neo", expectedVersion: 2,
      action: "integration.circuit.failure.recorded",
    }));
    const call = vi.mocked(s.commitAudited).mock.calls[0][0];
    expect(JSON.stringify(call.audit)).not.toMatch(/token|leaseOwner/i);
  });

  it("abre e avança cooldown somente pelo relógio interno", async () => {
    const opened = {
      ...base, state: "open" as const, version: 4, consecutiveFailures: 3,
      openedAtMs: 1_000, cooldownUntilMs: 31_000,
    };
    const s = storage({ load: vi.fn(async () => opened) });
    const c = createIntegrationCircuitCoordinator(s, () => 31_000);
    const result = await c.advanceCooldown({
      organizationId: 7, system: "neo", expectedVersion: 4,
    });
    expect(result).toMatchObject({ state: "half_open", version: 5, permitsProbe: false });
  });

  it("adquire lease fenced sem transformar propriedade em autorização de probe", async () => {
    const halfOpen = {
      ...base, state: "half_open" as const, version: 5, consecutiveFailures: 3,
      openedAtMs: 1_000, cooldownUntilMs: 31_000,
    };
    const s = storage({ load: vi.fn(async () => halfOpen) });
    const c = createIntegrationCircuitCoordinator(s, () => 32_000);
    const result = await c.claimProbeLease({
      organizationId: 7, system: "neo", expectedVersion: 5,
      leaseOwner: "worker-a", leaseToken: "opaque", leaseDurationMs: 5_000,
    });
    expect(result).toMatchObject({
      version: 6, leaseOwner: "worker-a", leaseExpiresAtMs: 37_000,
      permitsProbe: false,
    });
    const call = vi.mocked(s.commitAudited).mock.calls[0][0];
    expect(JSON.stringify(call.audit)).not.toContain("opaque");
  });

  it("falha em conflito CAS e nunca simula sucesso", async () => {
    const s = storage({ commitAudited: vi.fn(async () => false) });
    const c = createIntegrationCircuitCoordinator(s, () => 1_000);
    await expect(c.recordFailure({
      organizationId: 7, system: "neo", expectedVersion: 2,
      failureThreshold: 3, cooldownSeconds: 30,
    })).rejects.toBeInstanceOf(IntegrationCircuitCoordinatorConflictError);
  });

  it("rejeita tenant, sistema ou versão divergentes antes da escrita", async () => {
    const s = storage();
    const c = createIntegrationCircuitCoordinator(s, () => 1_000);
    await expect(c.recordFailure({
      organizationId: 8, system: "neo", expectedVersion: 2,
      failureThreshold: 3, cooldownSeconds: 30,
    })).rejects.toThrow(/escopo|tenant|organiza/i);
    await expect(c.recordFailure({
      organizationId: 7, system: "crm", expectedVersion: 2,
      failureThreshold: 3, cooldownSeconds: 30,
    })).rejects.toThrow(/sistema|escopo/i);
    await expect(c.recordFailure({
      organizationId: 7, system: "neo", expectedVersion: 1,
      failureThreshold: 3, cooldownSeconds: 30,
    })).rejects.toThrow(/versão/i);
    expect(s.commitAudited).not.toHaveBeenCalled();
  });
});
