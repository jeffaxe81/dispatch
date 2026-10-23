import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  createIntegrationCircuitMySqlStorage,
  hydrateIntegrationCircuitPersistence,
} from "./integrationCircuitMySqlStorage";

const row = {
  id: 3, organizationId: 7, system: "neo" as const, state: "half_open" as const,
  circuitVersion: 5, consecutiveFailures: 3, openedAtMs: 1_000,
  cooldownUntilMs: 31_000, probeLeaseOwner: null, probeLeaseToken: null,
  probeLeaseExpiresAtMs: null, createdAt: new Date(), updatedAt: new Date(),
};

type Db = Parameters<typeof createIntegrationCircuitMySqlStorage>[0];

function fakeDb(affectedRows = 1) {
  const dialect = new MySqlDialect();
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const audits: unknown[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: (clause:any) => ({
      limit: () => ({ for: async () => {
        queries.push(dialect.sqlToQuery(clause));
        return [{ ...row }];
      }}),
    }) }) }),
    update: () => ({ set: () => ({ where: async (clause:any) => {
      queries.push(dialect.sqlToQuery(clause));
      return [{ affectedRows }, []];
    }}) }),
    insert: () => ({ values: async (value:unknown) => { audits.push(value); } }),
  };
  const db = { transaction: async (fn:(tx:any)=>unknown) => fn(tx) } as unknown as Db;
  return { store:createIntegrationCircuitMySqlStorage(db), queries, audits };
}

describe("D-012J J28 — storage MySQL CAS/audit do circuito", () => {
  it("hidrata estado persistido sem expor segredo além do limite interno", () => {
    const s = hydrateIntegrationCircuitPersistence(row);
    expect(s).toMatchObject({
      organizationId:7, system:"neo", state:"half_open", version:5,
      consecutiveFailures:3, leaseToken:null,
    });
  });

  it("CAS transacional exige tenant+sistema+versão e grava audit sanitizado", async () => {
    const { store, queries, audits } = fakeDb();
    const current = await store.load({ organizationId:7, system:"neo" });
    const next = { ...current!, version:6, leaseOwner:"worker-a", leaseToken:"opaque", leaseExpiresAtMs:37_000 };
    expect(await store.commitAudited({
      organizationId:7, system:"neo", expectedVersion:5, current:current!, next,
      action:"integration.circuit.probe_lease.claimed",
      audit:{ before:{state:"half_open",version:5}, after:{state:"half_open",version:6} },
    })).toBe(true);
    expect(queries[0].sql).toContain("organization_id");
    expect(queries[0].sql).toContain("system");
    expect(queries[1].sql).toContain("circuit_version");
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain("opaque");
  });

  it("retorna false em conflito CAS sem inserir auditoria", async () => {
    const { store, audits } = fakeDb(0);
    const current = hydrateIntegrationCircuitPersistence(row);
    const next = { ...current, version:6 };
    expect(await store.commitAudited({
      organizationId:7, system:"neo", expectedVersion:5, current, next,
      action:"integration.circuit.failure.recorded",
      audit:{before:{state:"half_open",version:5},after:{state:"half_open",version:6}},
    })).toBe(false);
    expect(audits).toHaveLength(0);
  });
});
