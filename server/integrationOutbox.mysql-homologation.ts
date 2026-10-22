import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createConnection, type Connection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  assertEmptyIntegrationOutboxMysqlDatabase,
  getIntegrationOutboxMysqlSettings,
} from "./test/integrationOutboxMysqlEnvironment";
import {
  buildIntegrationOutboxClaim,
  buildIntegrationOutboxResolution,
  createIntegrationOutboxMySqlStorage,
} from "./integrationOutboxCas";
import {
  buildExpiredIntegrationLeaseQuarantine,
  createExpiredIntegrationLeaseRecoveryStorage,
} from "./integrationOutboxExpiredLease";

const NOW = Date.parse("2026-10-23T01:00:00.000Z");
const settings = getIntegrationOutboxMysqlSettings(process.env);
const connections = new Set<Connection>();
let control: Connection;
let tenantA: number;
let tenantB: number;

async function connection(): Promise<Connection> {
  const client = await createConnection(settings);
  connections.add(client);
  await client.query("SET SESSION time_zone = '+00:00'");
  await client.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await client.query("SET SESSION innodb_lock_wait_timeout = 4");
  return client;
}

function storage(client: Connection) {
  return createIntegrationOutboxMySqlStorage(drizzle({ client }));
}
function recovery(client: Connection) {
  return createExpiredIntegrationLeaseRecoveryStorage(drizzle({ client }));
}

async function insertDelivery(organizationId: number, idempotencyKey = randomUUID()) {
  const [res] = await control.execute<ResultSetHeader>(
    `INSERT INTO integration_delivery_outbox
      (organization_id, system, contract_version, mode, operation,
       message_id, idempotency_key, correlation_id,
       max_attempts, failure_threshold, cooldown_seconds, payload_reference)
     VALUES (?, 'neo', 1, 'event', 'interaction.updated', ?, ?, ?, 5, 3, 30, ?)`,
    [organizationId, randomUUID(), idempotencyKey, randomUUID(), "vault:fixture"],
  );
  expect(res.insertId).toBeGreaterThan(0);
  return res.insertId;
}

async function state(deliveryId: number) {
  const [rows] = await control.execute<RowDataPacket[]>(
    "SELECT organization_id AS organizationId, status, delivery_version AS version, delivery_attempts AS attempts, lease_token AS leaseToken, dead_lettered_at_ms AS deadLetteredAtMs FROM integration_delivery_outbox WHERE id = ?",
    [deliveryId],
  );
  return rows[0];
}

beforeAll(async () => {
  control = await connection();
  const [info] = await control.query<RowDataPacket[]>(
    "SELECT DATABASE() AS db, VERSION() AS version",
  );
  const [count] = await control.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  assertEmptyIntegrationOutboxMysqlDatabase(info[0].db, Number(count[0].n));
  expect(String(info[0].version)).toMatch(/^8\\.4\\./);
  // Uses the REAL migration journal through 0018 on this disposable schema.
  await migrate(drizzle({ client: control }), { migrationsFolder: "drizzle" });
  const [tables] = await control.query<RowDataPacket[]>(
    "SHOW TABLES LIKE 'integration_delivery_outbox'",
  );
  expect(tables).toHaveLength(1);
  const [ta] = await control.execute<ResultSetHeader>(
    "INSERT INTO organizations (code, name) VALUES (?, 'outbox fixture A')",
    ["outbox-a-" + randomUUID().slice(0, 8)],
  );
  const [tb] = await control.execute<ResultSetHeader>(
    "INSERT INTO organizations (code, name) VALUES (?, 'outbox fixture B')",
    ["outbox-b-" + randomUUID().slice(0, 8)],
  );
  tenantA = ta.insertId;
  tenantB = tb.insertId;
});
afterAll(async () => {
  for (const client of connections) {
    await client.rollback().catch(() => {});
    await client.end().catch(() => {});
  }
  connections.clear();
});

describe("D-012J J18 — MySQL 8.4 físico da outbox", () => {
  it("enforces tenant-scoped read and real FK/idempotency uniqueness", async () => {
    const key = "key-shared-" + randomUUID();
    const id = await insertDelivery(tenantA, key);
    expect(await storage(control).loadByTenant({
      organizationId: tenantB, deliveryId: id,
    })).toBeNull();
    const mine = await storage(control).loadByTenant({
      organizationId: tenantA, deliveryId: id,
    });
    expect(mine).toMatchObject({
      deliveryId: id, organizationId: tenantA,
      status: "pending", version: 0, attempts: 0,
    });
    const [other] = await control.execute<ResultSetHeader>(
      `INSERT INTO integration_delivery_outbox
        (organization_id, system, mode, operation, message_id,
         idempotency_key, correlation_id, max_attempts, failure_threshold, cooldown_seconds)
       VALUES (?, 'neo', 'event', 'interaction.updated', 'other', ?, ?, 5, 3, 30)`,
      [tenantB, key, randomUUID()],
    );
    expect(other.insertId).toBeGreaterThan(0); // idempotency is per tenant
    await expect(insertDelivery(tenantA, key)).rejects.toMatchObject({
      code: "ER_DUP_ENTRY",
    });
  });

  it("two physical workers reading the same version produce exactly one CAS winner", async () => {
    const id = await insertDelivery(tenantA);
    const a = await connection();
    const b = await connection();
    const [snapshotA, snapshotB] = await Promise.all([
      storage(a).loadByTenant({ organizationId: tenantA, deliveryId: id }),
      storage(b).loadByTenant({ organizationId: tenantA, deliveryId: id }),
    ]);
    expect(snapshotA).not.toBeNull();
    expect(snapshotB).not.toBeNull();
    const claimA = buildIntegrationOutboxClaim(snapshotA!, {
      nowEpochMs: NOW, workerId: "worker-a",
      leaseToken: "opaque-a", leaseDurationMs: 60_000,
    });
    const claimB = buildIntegrationOutboxClaim(snapshotB!, {
      nowEpochMs: NOW, workerId: "worker-b",
      leaseToken: "opaque-b", leaseDurationMs: 60_000,
    });
    const [wonA, wonB] = await Promise.all([
      storage(a).compareAndSwap({
        organizationId: tenantA, deliveryId: id, expectedVersion: 0,
        current: snapshotA!, next: claimA, nowEpochMs: NOW,
      }),
      storage(b).compareAndSwap({
        organizationId: tenantA, deliveryId: id, expectedVersion: 0,
        current: snapshotB!, next: claimB, nowEpochMs: NOW,
      }),
    ]);
    expect([wonA, wonB].filter(Boolean)).toHaveLength(1);
    expect(await state(id)).toMatchObject({
      status: "leased", version: 1, attempts: 1,
    });
  });

  it("expired recovery fences a stale worker without replaying externally", async () => {
    const id = await insertDelivery(tenantA);
    const a = await connection();
    const b = await connection();
    const original = (await storage(a).loadByTenant({
      organizationId: tenantA, deliveryId: id,
    }))!;
    const leased = buildIntegrationOutboxClaim(original, {
      nowEpochMs: NOW, workerId: "worker-old", leaseToken: "fence-old",
      leaseDurationMs: 1000,
    });
    expect(await storage(a).compareAndSwap({
      organizationId: tenantA, deliveryId: id, expectedVersion: 0,
      current: original, next: leased, nowEpochMs: NOW,
    })).toBe(true);
    const [wonRecovery, recovered] = await Promise.all([
      recovery(b).quarantineExpired({
        organizationId: tenantA, deliveryId: id, expectedVersion: 1,
        current: leased, nowEpochMs: NOW + 1000,
      }),
      Promise.resolve(buildExpiredIntegrationLeaseQuarantine(leased, NOW + 1000)),
    ]);
    expect(wonRecovery).toBe(true);
    expect(recovered).toMatchObject({ status: "dead_letter", lastFailureKind: "unknown" });
    // A worker can have a valid OLD snapshot; it must not commit after recovery.
    const stale = buildIntegrationOutboxResolution(leased, {
      nowEpochMs: NOW + 500, leaseToken: "fence-old", outcome: "delivered",
    });
    expect(await storage(a).compareAndSwap({
      organizationId: tenantA, deliveryId: id, expectedVersion: 1,
      current: leased, next: stale, nowEpochMs: NOW + 500,
    })).toBe(false);
    expect(await state(id)).toMatchObject({
      status: "dead_letter", version: 2, attempts: 1,
      leaseToken: null,
    });
  });

  it("two independent recovery sessions quarantine an expired lease once", async () => {
    const id = await insertDelivery(tenantA);
    const a = await connection();
    const b = await connection();
    const original = (await storage(control).loadByTenant({
      organizationId: tenantA, deliveryId: id,
    }))!;
    const leased = buildIntegrationOutboxClaim(original, {
      nowEpochMs: NOW, workerId: "worker-failed", leaseToken: "fence-failed",
      leaseDurationMs: 1000,
    });
    expect(await storage(control).compareAndSwap({
      organizationId: tenantA, deliveryId: id, expectedVersion: 0,
      current: original, next: leased, nowEpochMs: NOW,
    })).toBe(true);
    const results = await Promise.all([
      recovery(a).quarantineExpired({
        organizationId: tenantA, deliveryId: id, expectedVersion: 1,
        current: leased, nowEpochMs: NOW + 1001,
      }),
      recovery(b).quarantineExpired({
        organizationId: tenantA, deliveryId: id, expectedVersion: 1,
        current: leased, nowEpochMs: NOW + 1001,
      }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await state(id)).toMatchObject({
      status: "dead_letter", version: 2, attempts: 1,
    });
  });

  it("ROLLBACK undoes a real CAS claim without partial state", async () => {
    const id = await insertDelivery(tenantA);
    const tx = await connection();
    const reader = await connection();
    await tx.beginTransaction();
    try {
      const original = (await storage(tx).loadByTenant({
        organizationId: tenantA, deliveryId: id,
      }))!;
      const leased = buildIntegrationOutboxClaim(original, {
        nowEpochMs: NOW, workerId: "rollback-worker",
        leaseToken: "rollback-opaque", leaseDurationMs: 1000,
      });
      expect(await storage(tx).compareAndSwap({
        organizationId: tenantA, deliveryId: id, expectedVersion: 0,
        current: original, next: leased, nowEpochMs: NOW,
      })).toBe(true);
    } finally {
      await tx.rollback();
    }
    expect(await storage(reader).loadByTenant({
      organizationId: tenantA, deliveryId: id,
    })).toMatchObject({ status: "pending", version: 0, attempts: 0 });
  });

  it("strict expiry boundary rejects premature recovery even with a stale snapshot", async () => {
    const id = await insertDelivery(tenantA);
    const original = (await storage(control).loadByTenant({
      organizationId: tenantA, deliveryId: id,
    }))!;
    const leased = buildIntegrationOutboxClaim(original, {
      nowEpochMs: NOW, workerId: "boundary-worker",
      leaseToken: "boundary-opaque", leaseDurationMs: 1000,
    });
    await storage(control).compareAndSwap({
      organizationId: tenantA, deliveryId: id, expectedVersion: 0,
      current: original, next: leased, nowEpochMs: NOW,
    });
    await expect(recovery(control).quarantineExpired({
      organizationId: tenantA, deliveryId: id, expectedVersion: 1,
      current: leased, nowEpochMs: NOW + 999,
    })).rejects.toThrow(/não expirou/i);
    expect(await state(id)).toMatchObject({ status: "leased", version: 1 });
  });
});
