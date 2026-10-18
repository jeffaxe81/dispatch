import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { createWorkflowSlaDeliveryCoordinator } from "./workflowSlaDeliveryCoordinator";
import {
  createWorkflowSlaMySqlDeliveryStorage,
  hydrateWorkflowSlaIntent,
} from "./workflowSlaDeliveryMySql";

const now = "2026-10-18T10:00:00.000Z";
const row = {
  id: 44, taskId: 71, organizationId: 9, workflowVersionId: 101,
  nodeId: "human-review", correlationId: "corr-44",
  eventKind: "overdue" as const,
  eventType: "workflow.task.sla.overdue.v1",
  escalationMode: "notify_only" as const,
  scheduledAt: new Date(now), createdAt: new Date(now),
  status: "pending" as const, deliveryVersion: 0, deliveryAttempts: 0,
  leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null,
  nextAttemptAtMs: null, deliveredAtMs: null, deadLetteredAtMs: null,
  lastFailureCode: null,
};
const policy = {
  maxAttempts: 3,
  leaseDurationMs: 60_000,
  baseRetryMs: 5_000,
  maxRetryMs: 60_000,
};
type Db = Parameters<typeof createWorkflowSlaMySqlDeliveryStorage>[0];

function fakeDb(affectedRows = 1) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const patches: Record<string, unknown>[] = [];
  const dialect = new MySqlDialect();

  const db = {
    select: () => ({
      from: () => ({
        where: (where: Parameters<MySqlDialect["sqlToQuery"]>[0]) => ({
          limit: async () => {
            queries.push(dialect.sqlToQuery(where));
            return [{ ...row }];
          },
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (where: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
          queries.push(dialect.sqlToQuery(where));
          patches.push(patch);
          return [{ affectedRows }, []];
        },
      }),
    }),
  } as unknown as Db;

  return {
    storage: createWorkflowSlaMySqlDeliveryStorage(db),
    queries, patches,
  };
}

describe("D-012I I5B — CAS persistido no MySQL", () => {
  it("hidrata linha pendente antiga com defaults compatíveis com a migração 0016", () => {
    expect(hydrateWorkflowSlaIntent(row)).toMatchObject({
      intentId: 44, taskId: 71, organizationId: 9,
      status: "pending", version: 0, attempts: 0,
      leaseOwner: null, leaseExpiresAt: null,
    });
  });

  it("rejeita estado corrompido sem consertar silenciosamente", () => {
    expect(() => hydrateWorkflowSlaIntent({
      ...row, status: "leased", leaseOwner: null,
    } as typeof row)).toThrow(/Reserva SLA incompleta/);
    expect(() => hydrateWorkflowSlaIntent({
      ...row, scheduledAt: new Date("invalid"),
    } as typeof row)).toThrow(/Prazo original/);
    expect(() => hydrateWorkflowSlaIntent({
      ...row, eventType: "workflow.task.sla.reminder.v1",
    } as typeof row)).toThrow(/Metadados congelados/);
  });

  it("consultas e UPDATE têm tenant explícito; CAS compara versão e metadados congelados", async () => {
    const { storage, queries, patches } = fakeDb();
    const current = await storage.loadByTenant({ intentId: 44, organizationId: 9 });
    expect(current?.status).toBe("pending");
    const next = {
      ...current!, status: "leased" as const, version: 1, attempts: 1,
      leaseOwner: "worker-01", leaseToken: "opaque-token",
      leaseExpiresAt: "2026-10-18T10:01:00.000Z",
    };
    expect(await storage.compareAndSwap({
      intentId: 44, organizationId: 9, expectedVersion: 0, next,
    })).toBe(true);

    const [queryRead, queryWrite] = queries;
    expect(queryRead.sql).toMatch(/organization_id/);
    expect(queryRead.sql).toMatch(/id/);
    for (const identifier of [
      "id", "organization_id", "delivery_version", "task_id",
      "event_kind", "correlation_id", "scheduled_at",
    ]) {
      expect(queryWrite.sql).toContain(identifier);
    }
    expect(queryWrite.params).toContain(44);
    expect(queryWrite.params).toContain(9);
    expect(queryWrite.params).toContain(0);
    expect(patches[0]).toMatchObject({
      status: "leased", deliveryVersion: 1, deliveryAttempts: 1,
      leaseOwner: "worker-01", leaseToken: "opaque-token",
      leaseExpiresAtMs: Date.parse("2026-10-18T10:01:00.000Z"),
    });
  });

  it("trata zero linhas alteradas como conflito em vez de confirmar falsamente", async () => {
    const { storage } = fakeDb(0);
    const coordinator = createWorkflowSlaDeliveryCoordinator(storage, policy);
    await expect(coordinator.transition({
      intentId: 44, action: {
        type: "claim", organizationId: 9, now,
        workerId: "worker-01", leaseToken: "opaque-token",
      },
    })).rejects.toThrow(/outra transação/);
  });

  it("rejeita CAS com tenant, identificador ou versão inconsistentes antes do UPDATE", async () => {
    const { storage, patches } = fakeDb();
    const current = hydrateWorkflowSlaIntent(row);
    await expect(storage.compareAndSwap({
      intentId: 44, organizationId: 10, expectedVersion: 0,
      next: { ...current, version: 1 },
    })).rejects.toThrow(/escopo/);
    await expect(storage.compareAndSwap({
      intentId: 44, organizationId: 9, expectedVersion: 0,
      next: { ...current, version: 2 },
    })).rejects.toThrow(/sequência/);
    expect(patches).toHaveLength(0);
  });

  it("registra migration 0016 aditiva sem expurgo, grants ou mutações de ocorrência", async () => {
    const [{ default: migration }, { default: rawJournal }, { default: schema }] =
      await Promise.all([
        import("../../drizzle/0016_d012i_workflow_sla_delivery_cas.sql?raw"),
        import("../../drizzle/meta/_journal.json?raw"),
        import("./workflowSlaEventIntentSchema.ts?raw"),
      ]);
    const journal = JSON.parse(rawJournal) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    expect(journal.entries.find(entry => entry.idx === 16)).toMatchObject({
      idx: 16, tag: "0016_d012i_workflow_sla_delivery_cas",
    });
    for (const name of [
      "delivery_version", "delivery_attempts", "lease_owner",
      "lease_token", "lease_expires_at_ms", "next_attempt_at_ms",
      "delivered_at_ms", "dead_lettered_at_ms", "last_failure_code",
    ]) {
      expect(migration).toContain(name);
      expect(schema).toContain(name);
    }
    expect(migration).toMatch(/DEFAULT 0/);
    expect(migration).toMatch(/workflow_sla_intents_claim_idx/);
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE `incidents`|GRANT /i);
  });
});
