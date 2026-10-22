import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  buildExpiredIntegrationLeaseQuarantine,
  createExpiredIntegrationLeaseRecoveryStorage,
} from "./integrationOutboxExpiredLease";
import type { IntegrationOutboxSnapshot } from "./integrationOutboxCas";

const NOW = Date.parse("2026-10-22T23:50:00.000Z");
const leased: IntegrationOutboxSnapshot = {
  deliveryId: 63, organizationId: 7, system: "neo",
  contractVersion: 1, mode: "event", operation: "interaction.updated",
  messageId: "msg-63", idempotencyKey: "v1:7:neo:interaction.updated:msg-63",
  correlationId: "corr-63", status: "leased", version: 4,
  attempts: 2, maxAttempts: 5, failureThreshold: 3, cooldownSeconds: 30,
  leaseOwner: "worker-old", leaseToken: "fence-opaque",
  leaseExpiresAtMs: NOW, nextAttemptAtMs: null,
  deliveredAtMs: null, deadLetteredAtMs: null,
  payloadReference: "vault:ref-63", lastFailureKind: null,
};
type Db = Parameters<typeof createExpiredIntegrationLeaseRecoveryStorage>[0];

function fakeDb(affectedRows = 1) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const patches: Record<string, unknown>[] = [];
  const dialect = new MySqlDialect();
  const db = {
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (clause: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
          patches.push(patch);
          queries.push(dialect.sqlToQuery(clause));
          return [{ affectedRows }, []];
        },
      }),
    }),
  } as unknown as Db;
  return { storage: createExpiredIntegrationLeaseRecoveryStorage(db), queries, patches };
}

describe("D-012J J17 — quarentena conservadora de lease expirado", () => {
  it("quarentena na expiração exata, sem reenvio ou duplicação automática", () => {
    const result = buildExpiredIntegrationLeaseQuarantine(leased, NOW);
    expect(result).toEqual({
      ...leased, status: "dead_letter", version: 5, attempts: 2,
      leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
      deadLetteredAtMs: NOW, lastFailureKind: "unknown",
    });
    expect(leased.status).toBe("leased");
  });

  it("recusa lease ainda válido e relógio inválido", () => {
    expect(() => buildExpiredIntegrationLeaseQuarantine(leased, NOW - 1)).toThrow(/não expirou/i);
    expect(() => buildExpiredIntegrationLeaseQuarantine(leased, -1)).toThrow(/relógio/i);
    expect(() => buildExpiredIntegrationLeaseQuarantine(leased, Number.NaN)).toThrow(/relógio/i);
  });

  it("recusa estados terminais, pendentes ou lease malformado", () => {
    expect(() => buildExpiredIntegrationLeaseQuarantine({
      ...leased, status: "pending", leaseOwner: null, leaseToken: null,
      leaseExpiresAtMs: null,
    }, NOW)).toThrow(/leased|reservad/i);
    expect(() => buildExpiredIntegrationLeaseQuarantine({
      ...leased, status: "leased", leaseToken: null,
    }, NOW)).toThrow(/lease/i);
    expect(() => buildExpiredIntegrationLeaseQuarantine({
      ...leased, status: "delivered", deliveredAtMs: NOW,
      leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
    }, NOW)).toThrow(/leased|reservad/i);
  });

  it("UPDATE contém tenant, identidade, status, versão, token e expiração <= relógio", async () => {
    const { storage, queries, patches } = fakeDb();
    const result = await storage.quarantineExpired({
      organizationId: 7, deliveryId: 63, expectedVersion: 4,
      current: leased, nowEpochMs: NOW,
    });
    expect(result).toBe(true);
    expect(queries).toHaveLength(1);
    const { sql, params } = queries[0];
    for (const name of [
      "organization_id", "id", "delivery_version", "status",
      "lease_token", "lease_expires_at_ms", "system",
      "idempotency_key", "correlation_id",
    ]) expect(sql).toContain(name);
    expect(sql).toMatch(/<=|<=/);
    expect(params).toContain(7);
    expect(params).toContain(63);
    expect(params).toContain(4);
    expect(params).toContain("fence-opaque");
    expect(params).toContain(NOW);
    expect(patches[0]).toMatchObject({
      status: "dead_letter", deliveryVersion: 5, deliveryAttempts: 2,
      leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
      deadLetteredAtMs: NOW, lastFailureKind: "unknown",
    });
  });

  it("CAS obsoleto retorna false, sem sinalizar falsa recuperação", async () => {
    const { storage } = fakeDb(0);
    expect(await storage.quarantineExpired({
      organizationId: 7, deliveryId: 63, expectedVersion: 4,
      current: leased, nowEpochMs: NOW,
    })).toBe(false);
  });

  it("bloqueia alterações em mais de uma linha", async () => {
    const { storage } = fakeDb(2);
    await expect(storage.quarantineExpired({
      organizationId: 7, deliveryId: 63, expectedVersion: 4,
      current: leased, nowEpochMs: NOW,
    })).rejects.toThrow(/invariante|múltiplas/i);
  });

  it("rejeita escopo cruzado e versão errada antes de fazer UPDATE", async () => {
    const { storage, patches } = fakeDb();
    await expect(storage.quarantineExpired({
      organizationId: 8, deliveryId: 63, expectedVersion: 4,
      current: leased, nowEpochMs: NOW,
    })).rejects.toThrow(/escopo/i);
    await expect(storage.quarantineExpired({
      organizationId: 7, deliveryId: 63, expectedVersion: 3,
      current: leased, nowEpochMs: NOW,
    })).rejects.toThrow(/versão/i);
    expect(patches).toHaveLength(0);
  });

  it("não expõe payload bruto, credencial ou mensagens externas na mutação", async () => {
    const { storage, patches } = fakeDb();
    const decision = buildExpiredIntegrationLeaseQuarantine(leased, NOW);
    expect(decision.payloadReference).toBe("vault:ref-63");
    for (const key of ["payload", "authorization", "errorMessage", "responseData", "stack"]) {
      expect(decision).not.toHaveProperty(key);
    }
    await storage.quarantineExpired({
      organizationId: 7, deliveryId: 63, expectedVersion: 4,
      current: leased, nowEpochMs: NOW,
    });
    expect(patches[0]).not.toHaveProperty("payloadReference");
  });
});
