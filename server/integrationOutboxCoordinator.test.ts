import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIntegrationOutboxCasCoordinator,
  IntegrationOutboxCoordinatorConflictError,
} from "./integrationOutboxCoordinator";
import type { IntegrationOutboxSnapshot } from "./integrationOutboxCas";

const NOW = Date.parse("2026-10-23T01:00:00.000Z");
const initial: IntegrationOutboxSnapshot = {
  deliveryId: 91, organizationId: 7, system: "crm", contractVersion: 1,
  mode: "event", operation: "contact.updated", messageId: "msg-91",
  idempotencyKey: "key-91", correlationId: "corr-91",
  status: "pending", version: 0, attempts: 0, maxAttempts: 4,
  failureThreshold: 3, cooldownSeconds: 30,
  leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
  nextAttemptAtMs: null, deliveredAtMs: null, deadLetteredAtMs: null,
  payloadReference: "vault:payload-91", lastFailureKind: null,
};
type Storage = Parameters<typeof createIntegrationOutboxCasCoordinator>[0];

function storage(initialState: IntegrationOutboxSnapshot = initial) {
  let state = { ...initialState };
  let writes = 0;
  const adapter: Storage = {
    async loadByTenant({ organizationId, deliveryId }) {
      return organizationId === state.organizationId
        && deliveryId === state.deliveryId ? { ...state } : null;
    },
    async compareAndSwap({ organizationId, deliveryId, expectedVersion, current, next }) {
      if (organizationId !== state.organizationId
        || deliveryId !== state.deliveryId
        || expectedVersion !== state.version
        || current.status !== state.status
        || current.leaseToken !== state.leaseToken
      ) return false;
      state = { ...next };
      writes++;
      return true;
    },
  };
  return { adapter, snapshot: () => ({ ...state }), writes: () => writes };
}

function enable() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
  vi.stubEnv("AXE_INTEGRATION_OUTBOX_J23_ENABLED", "true");
}
function request() {
  return {
    organizationId: 7, deliveryId: 91,
    workerId: "worker-a", leaseToken: "token-secret-a",
    leaseDurationMs: 60_000,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("D-012J J23 — coordinator usa CAS existente sem abrir transporte", () => {
  it("faz claim por tenant e CAS, incrementando tentativa e versão", async () => {
    enable();
    const store = storage();
    const current = await createIntegrationOutboxCasCoordinator(store.adapter, () => NOW)
      .claim(request());
    expect(current).toMatchObject({
      organizationId: 7, deliveryId: 91, version: 1,
      attempts: 1, status: "leased",
      leaseOwner: "worker-a", leaseExpiresAtMs: NOW + 60_000,
    });
    expect(store.writes()).toBe(1);
    expect(store.snapshot().version).toBe(1);
    expect(initial.status).toBe("pending");
  });

  it("confirma entrega somente para proprietário, token e versão ativos", async () => {
    enable();
    const store = storage();
    await createIntegrationOutboxCasCoordinator(store.adapter, () => NOW).claim(request());
    const coordinator = createIntegrationOutboxCasCoordinator(store.adapter, () => NOW + 1_000);
    const result = await coordinator.resolve({
      organizationId: 7, deliveryId: 91, workerId: "worker-a",
      leaseToken: "token-secret-a", expectedVersion: 1,
      outcome: "delivered",
    });
    expect(result).toMatchObject({
      status: "delivered", version: 2, deliveredAtMs: NOW + 1_000,
      leaseOwner: null, leaseToken: null,
    });
    expect(store.writes()).toBe(2);
  });

  it("não permite duas claims concorrentes da mesma versão", async () => {
    enable();
    const store = storage();
    const coordinator = createIntegrationOutboxCasCoordinator(store.adapter, () => NOW);
    const results = await Promise.allSettled([
      coordinator.claim(request()),
      coordinator.claim({ ...request(), workerId: "worker-b", leaseToken: "token-b" }),
    ]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(x =>
      x.status === "rejected"
      && x.reason instanceof IntegrationOutboxCoordinatorConflictError,
    )).toHaveLength(1);
    expect(store.writes()).toBe(1);
    expect(store.snapshot()).toMatchObject({ status: "leased", attempts: 1, version: 1 });
  });

  it("bloqueia versão obsoleta, worker diferente ou token revogado", async () => {
    enable();
    const store = storage();
    await createIntegrationOutboxCasCoordinator(store.adapter, () => NOW).claim(request());
    const coordinator = createIntegrationOutboxCasCoordinator(store.adapter, () => NOW + 500);
    const valid = {
      organizationId: 7, deliveryId: 91, workerId: "worker-a",
      expectedVersion: 1, leaseToken: "token-secret-a",
      outcome: "delivered" as const,
    };
    await expect(coordinator.resolve({ ...valid, expectedVersion: 0 }))
      .rejects.toBeInstanceOf(Error);
    await expect(coordinator.resolve({ ...valid, expectedVersion: 2 }))
      .rejects.toBeInstanceOf(IntegrationOutboxCoordinatorConflictError);
    await expect(coordinator.resolve({ ...valid, workerId: "worker-b" }))
      .rejects.toThrow(/worker|proprietário/i);
    await expect(coordinator.resolve({ ...valid, leaseToken: "wrong-token" }))
      .rejects.toThrow(/token|fencing/i);
    expect(store.writes()).toBe(1);
  });

  it("nega resolução atrasada no instante da expiração do lease", async () => {
    enable();
    const store = storage();
    await createIntegrationOutboxCasCoordinator(store.adapter, () => NOW).claim(request());
    await expect(createIntegrationOutboxCasCoordinator(
      store.adapter, () => NOW + 60_000,
    ).resolve({
      organizationId: 7, deliveryId: 91, workerId: "worker-a",
      leaseToken: "token-secret-a", expectedVersion: 1, outcome: "delivered",
    })).rejects.toThrow(/expirad/i);
    expect(store.writes()).toBe(1);
  });

  it("aceita retry tipado e depois quarentena sem reenviar mensagens", async () => {
    enable();
    const store = storage();
    await createIntegrationOutboxCasCoordinator(store.adapter, () => NOW).claim(request());
    const retry = await createIntegrationOutboxCasCoordinator(
      store.adapter, () => NOW + 100,
    ).resolve({
      organizationId: 7, deliveryId: 91, workerId: "worker-a",
      leaseToken: "token-secret-a", expectedVersion: 1,
      outcome: "retry", failureKind: "timeout",
      nextAttemptAtMs: NOW + 10_000,
    });
    expect(retry).toMatchObject({
      status: "pending", version: 2, attempts: 1,
      nextAttemptAtMs: NOW + 10_000, lastFailureKind: "timeout",
    });
    await createIntegrationOutboxCasCoordinator(
      store.adapter, () => NOW + 10_001,
    ).claim({ ...request(), leaseToken: "token-b" });
    const dead = await createIntegrationOutboxCasCoordinator(
      store.adapter, () => NOW + 10_002,
    ).resolve({
      organizationId: 7, deliveryId: 91, workerId: "worker-a",
      leaseToken: "token-b", expectedVersion: 3, outcome: "dead_letter",
      failureKind: "authorization",
    });
    expect(dead).toMatchObject({
      status: "dead_letter", version: 4,
      attempts: 2, lastFailureKind: "authorization",
    });
    expect(store.writes()).toBe(4);
  });

  it("nega acesso entre organizações e snapshots de storage fora do escopo", async () => {
    enable();
    const store = storage();
    const coordinator = createIntegrationOutboxCasCoordinator(store.adapter, () => NOW);
    await expect(coordinator.claim({ ...request(), organizationId: 8 }))
      .rejects.toThrow(/organização|autorizada/i);
    const poisoned: Storage = {
      loadByTenant: async () => ({ ...initial, organizationId: 8 }),
      compareAndSwap: async () => { throw new Error("write must not occur"); },
    };
    await expect(createIntegrationOutboxCasCoordinator(poisoned, () => NOW)
      .claim(request())).rejects.toThrow(/escopo/i);
    expect(store.writes()).toBe(0);
  });

  it("retorna conflito explícito em CAS perdido sem tratar como sucesso", async () => {
    enable();
    const blocked: Storage = {
      loadByTenant: async () => ({ ...initial }),
      compareAndSwap: async () => false,
    };
    await expect(createIntegrationOutboxCasCoordinator(blocked, () => NOW)
      .claim(request())).rejects.toBeInstanceOf(IntegrationOutboxCoordinatorConflictError);
  });

  it("falha fechado fora de homologação/opt-in sem carregar o armazenamento", async () => {
    let reads = 0;
    const never: Storage = {
      loadByTenant: async () => { reads++; return { ...initial }; },
      compareAndSwap: async () => { throw new Error("write must not occur"); },
    };
    await expect(createIntegrationOutboxCasCoordinator(never, () => NOW)
      .claim(request())).rejects.toThrow(/desabilitado/i);
    expect(reads).toBe(0);
  });
});
