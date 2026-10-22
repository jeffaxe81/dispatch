import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  buildIntegrationOutboxClaim,
  buildIntegrationOutboxResolution,
  createIntegrationOutboxMySqlStorage,
  hydrateIntegrationOutbox,
} from "./integrationOutboxCas";

const NOW = Date.parse("2026-10-22T23:00:00.000Z");
const row = {
  id: 44, organizationId: 9, system: "crm" as const, contractVersion: 1,
  mode: "event" as const, operation: "contact.updated", messageId: "msg-44",
  idempotencyKey: "key-44", correlationId: "corr-44",
  status: "pending" as const, deliveryVersion: 0, deliveryAttempts: 0,
  maxAttempts: 4, failureThreshold: 3, cooldownSeconds: 30,
  leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
  nextAttemptAtMs: null, deliveredAtMs: null, deadLetteredAtMs: null,
  payloadReference: "vault:item-44", lastFailureKind: null,
  createdAt: new Date(NOW), updatedAt: new Date(NOW),
};
type Db = Parameters<typeof createIntegrationOutboxMySqlStorage>[0];

function fakeDb(affectedRows = 1) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const patches: Record<string, unknown>[] = [];
  const dialect = new MySqlDialect();
  const db = {
    select: () => ({
      from: () => ({
        where: (clause: Parameters<MySqlDialect["sqlToQuery"]>[0]) => ({
          limit: async () => {
            queries.push(dialect.sqlToQuery(clause));
            return [{ ...row }];
          },
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (clause: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
          queries.push(dialect.sqlToQuery(clause));
          patches.push(patch);
          return [{ affectedRows }, []];
        },
      }),
    }),
  } as unknown as Db;
  return { store: createIntegrationOutboxMySqlStorage(db), queries, patches };
}

describe("D-012J J16 — outbox tenant-scoped com CAS/fencing", () => {
  it("hidrata somente metadados seguros e imutáveis da integração", () => {
    const current = hydrateIntegrationOutbox(row);
    expect(current).toMatchObject({
      deliveryId: 44, organizationId: 9, system: "crm", contractVersion: 1,
      status: "pending", version: 0, attempts: 0, payloadReference: "vault:item-44",
    });
    for (const forbidden of ["payload", "token", "authorization", "responseData", "errorMessage"]) {
      expect(current).not.toHaveProperty(forbidden);
    }
  });

  it("rejeita inconsistências de lease, status, tenant e contrato sem corrigir silenciosamente", () => {
    expect(() => hydrateIntegrationOutbox({ ...row, organizationId: 0 })).toThrow(/organiza/i);
    expect(() => hydrateIntegrationOutbox({ ...row, contractVersion: 2 })).toThrow(/versão/i);
    expect(() => hydrateIntegrationOutbox({ ...row, system: "billing" as never })).toThrow(/contrato/i);
    expect(() => hydrateIntegrationOutbox({ ...row, status: "leased", leaseOwner: null } as never)).toThrow(/lease/i);
    expect(() => hydrateIntegrationOutbox({ ...row, status: "delivered" } as never)).toThrow(/delivered/i);
  });

  it("faz claim somente de pending elegível com token e lease explícitos", () => {
    const current = hydrateIntegrationOutbox(row);
    const leased = buildIntegrationOutboxClaim(current, {
      nowEpochMs: NOW, workerId: "worker-9", leaseToken: "lease-opaque",
      leaseDurationMs: 60_000,
    });
    expect(leased).toMatchObject({
      deliveryId: 44, organizationId: 9, status: "leased", version: 1,
      attempts: 1, leaseOwner: "worker-9", leaseToken: "lease-opaque",
      leaseExpiresAtMs: NOW + 60_000, nextAttemptAtMs: null,
    });
    expect(() => buildIntegrationOutboxClaim({
      ...current, nextAttemptAtMs: NOW + 1,
    }, { nowEpochMs: NOW, workerId: "w", leaseToken: "opaque", leaseDurationMs: 1000 }))
      .toThrow(/agendada|elegível/i);
    expect(() => buildIntegrationOutboxClaim({
      ...current, attempts: 4,
    }, { nowEpochMs: NOW, workerId: "w", leaseToken: "opaque", leaseDurationMs: 1000 }))
      .toThrow(/tentativas/i);
  });

  it("fenceia resolução de worker com token e horário antes de liberar retry ou entregar", () => {
    const current = buildIntegrationOutboxClaim(hydrateIntegrationOutbox(row), {
      nowEpochMs: NOW, workerId: "worker-9", leaseToken: "lease-opaque",
      leaseDurationMs: 60_000,
    });
    const delivered = buildIntegrationOutboxResolution(current, {
      nowEpochMs: NOW + 10_000, leaseToken: "lease-opaque", outcome: "delivered",
    });
    expect(delivered).toMatchObject({
      status: "delivered", version: 2, deliveredAtMs: NOW + 10_000,
      leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
    });
    expect(() => buildIntegrationOutboxResolution(current, {
      nowEpochMs: NOW + 10_000, leaseToken: "stale", outcome: "delivered",
    })).toThrow(/token|fencing/i);
    expect(() => buildIntegrationOutboxResolution(current, {
      nowEpochMs: NOW + 60_001, leaseToken: "lease-opaque", outcome: "delivered",
    })).toThrow(/expirad/i);
    const retry = buildIntegrationOutboxResolution(current, {
      nowEpochMs: NOW + 10_000, leaseToken: "lease-opaque", outcome: "retry",
      failureKind: "timeout", nextAttemptAtMs: NOW + 30_000,
    });
    expect(retry).toMatchObject({
      status: "pending", version: 2, nextAttemptAtMs: NOW + 30_000,
      lastFailureKind: "timeout", leaseToken: null,
    });
  });

  it("rejeita retry ao esgotar limite e impede replay de terminal", () => {
    const leased = buildIntegrationOutboxClaim(hydrateIntegrationOutbox(row), {
      nowEpochMs: NOW, workerId: "worker-9", leaseToken: "lease-opaque", leaseDurationMs: 10_000,
    });
    expect(() => buildIntegrationOutboxResolution({
      ...leased, attempts: 4,
    }, {
      nowEpochMs: NOW + 1000, leaseToken: "lease-opaque", outcome: "retry",
      nextAttemptAtMs: NOW + 3000, failureKind: "timeout",
    })).toThrow(/tentativas/i);
    const terminal = buildIntegrationOutboxResolution(leased, {
      nowEpochMs: NOW + 1000, leaseToken: "lease-opaque", outcome: "dead_letter",
      failureKind: "unavailable",
    });
    expect(terminal).toMatchObject({
      status: "dead_letter", deadLetteredAtMs: NOW + 1000, version: 2,
    });
    expect(() => buildIntegrationOutboxClaim(terminal, {
      nowEpochMs: NOW + 2000, workerId: "worker-9", leaseToken: "x", leaseDurationMs: 1000,
    })).toThrow(/pending/i);
  });

  it("SQL de leitura e UPDATE CAS exigem tenant, ID, versão, status e lease token", async () => {
    const { store, queries, patches } = fakeDb();
    const current = await store.loadByTenant({ deliveryId: 44, organizationId: 9 });
    expect(current).not.toBeNull();
    const next = buildIntegrationOutboxClaim(current!, {
      nowEpochMs: NOW, workerId: "worker-9", leaseToken: "opaque", leaseDurationMs: 30_000,
    });
    expect(await store.compareAndSwap({
      organizationId: 9, deliveryId: 44, expectedVersion: 0, nowEpochMs: NOW, current: current!, next,
    })).toBe(true);
    const [read, write] = queries;
    expect(read.sql).toContain("organization_id");
    for (const field of [
      "organization_id", "delivery_version", "status", "lease_token",
      "idempotency_key", "correlation_id",
    ]) expect(write.sql).toContain(field);
    expect(write.params).toContain(9);
    expect(write.params).toContain(44);
    expect(write.params).toContain(0);
    expect(write.sql).toContain("next_attempt_at_ms");
    expect(patches[0]).toMatchObject({
      status: "leased", deliveryVersion: 1, deliveryAttempts: 1,
      leaseToken: "opaque", leaseExpiresAtMs: NOW + 30_000,
    });
  });

  it("retorna conflito CAS quando zero linhas mudam, sem simular sucesso", async () => {
    const { store } = fakeDb(0);
    const current = hydrateIntegrationOutbox(row);
    const next = buildIntegrationOutboxClaim(current, {
      nowEpochMs: NOW, workerId: "w", leaseToken: "opaque", leaseDurationMs: 1000,
    });
    expect(await store.compareAndSwap({
      organizationId: 9, deliveryId: 44, expectedVersion: 0, nowEpochMs: NOW, current, next,
    })).toBe(false);
  });

  it("bloqueia escopo cruzado, versões obsoletas e alterações de identidade antes de tocar o banco", async () => {
    const { store, patches } = fakeDb();
    const current = hydrateIntegrationOutbox(row);
    const next = buildIntegrationOutboxClaim(current, {
      nowEpochMs: NOW, workerId: "w", leaseToken: "opaque", leaseDurationMs: 1000,
    });
    await expect(store.compareAndSwap({
      organizationId: 10, deliveryId: 44, expectedVersion: 0, nowEpochMs: NOW, current, next,
    })).rejects.toThrow(/escopo/i);
    await expect(store.compareAndSwap({
      organizationId: 9, deliveryId: 44, expectedVersion: 1, nowEpochMs: NOW, current, next,
    })).rejects.toThrow(/versão/i);
    await expect(store.compareAndSwap({
      organizationId: 9, deliveryId: 44, expectedVersion: 0, nowEpochMs: NOW, current,
      next: { ...next, correlationId: "other-tenant" },
    })).rejects.toThrow(/imutáv/i);
    expect(patches).toHaveLength(0);
  });

  it("defesa em profundidade recusa claim prematuro ou conclusão com lease expirado no CAS", async () => {
    const { store, patches } = fakeDb();
    const current = hydrateIntegrationOutbox(row);
    const leased = buildIntegrationOutboxClaim(current, {
      nowEpochMs: NOW, workerId: "w", leaseToken: "opaque", leaseDurationMs: 1000,
    });
    await expect(store.compareAndSwap({
      organizationId: 9, deliveryId: 44, expectedVersion: 0, nowEpochMs: NOW,
      current: { ...current, nextAttemptAtMs: NOW + 1000 }, next: leased,
    })).rejects.toThrow(/elegível/i);
    const done = buildIntegrationOutboxResolution(leased, {
      nowEpochMs: NOW + 500, leaseToken: "opaque", outcome: "delivered",
    });
    await expect(store.compareAndSwap({
      organizationId: 9, deliveryId: 44, expectedVersion: 1, nowEpochMs: NOW + 1000,
      current: leased, next: done,
    })).rejects.toThrow(/expirado/i);
    expect(patches).toHaveLength(0);
  });
});
