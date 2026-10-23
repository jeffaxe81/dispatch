import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
import { createIntegrationRecoveryAuditedMySqlService } from "./integrationOutboxRecoveryAuditedMySql";
import { createIntegrationRecoveryAuditVerifier } from "./integrationOutboxRecoveryAuditVerifier";
import { createIntegrationOutboxCasCoordinator } from "./integrationOutboxCoordinator";
import { planIntegrationFailureResolution } from "./integrationFailurePolicy";
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

async function insertDelivery(organizationId: number, idempotencyKey: string = randomUUID()) {
  const [res] = await control.execute<ResultSetHeader>(
    `INSERT INTO integration_delivery_outbox
      (\`organization_id\`, \`system\`, \`contract_version\`, \`mode\`, \`operation\`,
       \`message_id\`, \`idempotency_key\`, \`correlation_id\`,
       \`max_attempts\`, \`failure_threshold\`, \`cooldown_seconds\`, \`payload_reference\`)
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
  expect(String(info[0].version)).toMatch(/^8\.4\./);
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
afterEach(() => vi.unstubAllEnvs());

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
        (\`organization_id\`, \`system\`, \`mode\`, \`operation\`, \`message_id\`,
         \`idempotency_key\`, \`correlation_id\`, \`max_attempts\`, \`failure_threshold\`, \`cooldown_seconds\`)
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

async function seedJ20Administrator(organizationId: number, grantRecover = true) {
  const [user] = await control.execute<ResultSetHeader>(
    "INSERT INTO users (\`openId\`, name, active) VALUES (?, 'J20 disposable admin', 1)",
    ["j20-" + randomUUID()],
  );
  // RBAC recognizes the literal 'administrador' role code, not an arbitrary
  // fixture role name. Permissions live in a second, per-actor scoped role.
  await control.execute(
    "INSERT INTO access_roles (code, name, role_scope, active) VALUES ('administrador', 'J20 tenant admin', 'organizacao', 1) ON DUPLICATE KEY UPDATE role_scope = 'organizacao', active = 1",
  );
  const [admin] = await control.execute<RowDataPacket[]>(
    "SELECT id FROM access_roles WHERE code = 'administrador' AND active = 1",
  );
  expect(admin).toHaveLength(1);
  const [entitlement] = await control.execute<ResultSetHeader>(
    "INSERT INTO access_roles (code, name, role_scope, active) VALUES (?, 'J20 scoped permissions', 'organizacao', 1)",
    ["j20-entitlement-" + randomUUID()],
  );
  for (const roleId of [admin[0].id, entitlement.insertId]) {
    await control.execute(
      "INSERT INTO user_role_assignments (user_id, role_id, organization_id, active) VALUES (?, ?, ?, 1)",
      [user.insertId, roleId, organizationId],
    );
  }
  for (const permission of ["workflow.execute", ...(grantRecover ? ["integrations.recover"] : [])]) {
    await control.execute(
      "INSERT INTO access_permissions (code, resource, action, active) VALUES (?, 'integration', 'recover', 1) ON DUPLICATE KEY UPDATE id = id",
      [permission],
    );
    const [rows] = await control.execute<RowDataPacket[]>(
      "SELECT id FROM access_permissions WHERE code = ? AND active = 1",
      [permission],
    );
    expect(rows).toHaveLength(1);
    await control.execute(
      "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
      [entitlement.insertId, rows[0].id],
    );
  }
  return user.insertId;
}

async function seedJ20Leased(organizationId: number) {
  const deliveryId = await insertDelivery(organizationId);
  const current = (await storage(control).loadByTenant({ organizationId, deliveryId }))!;
  const next = buildIntegrationOutboxClaim(current, {
    nowEpochMs: NOW, workerId: "j20-worker", leaseToken: randomUUID(),
    leaseDurationMs: 1000,
  });
  expect(await storage(control).compareAndSwap({
    organizationId, deliveryId, expectedVersion: 0,
    current, next, nowEpochMs: NOW,
  })).toBe(true);
  return { deliveryId, next };
}

function enableJ20() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
  vi.stubEnv("AXE_INTEGRATION_RECOVERY_J20_ENABLED", "true");
}

describe("D-012J J20 — transação real de quarentena e auditoria", () => {
  it("commits quarantined state and sanitized audit in the same transaction", async () => {
    enableJ20();
    const actorUserId = await seedJ20Administrator(tenantA);
    const { deliveryId } = await seedJ20Leased(tenantA);
    const tx = await connection();
    const result = await createIntegrationRecoveryAuditedMySqlService(
      drizzle({ client: tx }), () => NOW + 1001,
    ).quarantineExpired({
      authenticatedActorUserId: actorUserId,
      resolvedOrganizationId: tenantA, deliveryId, expectedVersion: 1,
      reasonCode: "delivery_outcome_unknown", ticketReference: "INC-12345",
      operatorApproved: true,
    });
    expect(result).toMatchObject({
      outcome: "quarantined", organizationId: tenantA,
      deliveryId, version: 2,
    });
    expect(await state(deliveryId)).toMatchObject({
      status: "dead_letter", version: 2, attempts: 1, leaseToken: null,
    });
    const [audits] = await control.execute<RowDataPacket[]>(
      "SELECT before_data AS beforeData, after_data AS afterData, actor_user_id AS actorId FROM audit_logs WHERE resource_type = 'integration_delivery_outbox' AND resource_id = ?",
      [deliveryId],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(actorUserId);
    const serialized = JSON.stringify(audits[0]);
    expect(serialized).toContain("INC-12345");
    expect(serialized).not.toContain("vault:fixture");
    expect(serialized).not.toContain("j20-worker");
    expect(serialized).not.toContain("lease_token");
  });

  it("rejects cross-tenant actor or missing explicit recovery grant without changing data", async () => {
    enableJ20();
    const wrongTenantActor = await seedJ20Administrator(tenantB);
    const noGrantActor = await seedJ20Administrator(tenantA, false);
    const { deliveryId } = await seedJ20Leased(tenantA);
    const service = createIntegrationRecoveryAuditedMySqlService(
      drizzle({ client: await connection() }), () => NOW + 1001,
    );
    const base = {
      resolvedOrganizationId: tenantA, deliveryId, expectedVersion: 1,
      reasonCode: "delivery_outcome_unknown" as const,
      ticketReference: "INC-12345", operatorApproved: true as const,
    };
    await expect(service.quarantineExpired({
      ...base, authenticatedActorUserId: wrongTenantActor,
    })).rejects.toThrow(/administrador|escopo/i);
    await expect(service.quarantineExpired({
      ...base, authenticatedActorUserId: noGrantActor,
    })).rejects.toThrow(/permiss/i);
    expect(await state(deliveryId)).toMatchObject({ status: "leased", version: 1 });
    const [audits] = await control.execute<RowDataPacket[]>(
      "SELECT id FROM audit_logs WHERE resource_type = 'integration_delivery_outbox' AND resource_id = ?",
      [deliveryId],
    );
    expect(audits).toHaveLength(0);
  });

  it("rolls back the quarantined state if the SQL audit INSERT fails", async () => {
    enableJ20();
    const actorUserId = await seedJ20Administrator(tenantA);
    const { deliveryId } = await seedJ20Leased(tenantA);
    const guard = "j20_audit_failure_" + deliveryId;
    await control.query(
      `ALTER TABLE audit_logs ADD CONSTRAINT \`${guard}\` CHECK (resource_type <> 'integration_delivery_outbox' OR resource_id <> ${deliveryId})`,
    );
    try {
      const [attempt] = await Promise.allSettled([
        createIntegrationRecoveryAuditedMySqlService(
          drizzle({ client: await connection() }), () => NOW + 1001,
        ).quarantineExpired({
          authenticatedActorUserId: actorUserId,
          resolvedOrganizationId: tenantA, deliveryId, expectedVersion: 1,
          reasonCode: "delivery_outcome_unknown", ticketReference: "OPS-12345",
          operatorApproved: true,
        }),
      ]);
      expect(attempt.status).toBe("rejected");
      if (attempt.status === "rejected") {
        expect(String(attempt.reason)).toMatch(/audit_logs/i);
        let cause: unknown = attempt.reason;
        let code: string | undefined;
        const visited = new Set<object>();
        while (cause && typeof cause === "object" && !visited.has(cause)) {
          visited.add(cause);
          const detail = cause as { code?: unknown; cause?: unknown };
          if (typeof detail.code === "string") { code = detail.code; break; }
          cause = detail.cause;
        }
        expect(code).toBe("ER_CHECK_CONSTRAINT_VIOLATED");
      }
    } finally {
      await control.query(`ALTER TABLE audit_logs DROP CHECK \`${guard}\``);
    }
    expect(await state(deliveryId)).toMatchObject({
      status: "leased", version: 1, attempts: 1,
    });
    const [audits] = await control.execute<RowDataPacket[]>(
      "SELECT id FROM audit_logs WHERE resource_type = 'integration_delivery_outbox' AND resource_id = ?",
      [deliveryId],
    );
    expect(audits).toHaveLength(0);
  });

  it("allows just one of two concurrent recoveries and writes a single audit", async () => {
    enableJ20();
    const actorUserId = await seedJ20Administrator(tenantA);
    const { deliveryId } = await seedJ20Leased(tenantA);
    const request = {
      authenticatedActorUserId: actorUserId,
      resolvedOrganizationId: tenantA, deliveryId, expectedVersion: 1,
      reasonCode: "delivery_outcome_unknown" as const,
      ticketReference: "CHG-12345", operatorApproved: true as const,
    };
    const a = createIntegrationRecoveryAuditedMySqlService(
      drizzle({ client: await connection() }), () => NOW + 1001,
    );
    const b = createIntegrationRecoveryAuditedMySqlService(
      drizzle({ client: await connection() }), () => NOW + 1001,
    );
    const results = await Promise.allSettled([
      a.quarantineExpired(request), b.quarantineExpired(request),
    ]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
    expect(await state(deliveryId)).toMatchObject({ status: "dead_letter", version: 2 });
    const [rows] = await control.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE resource_type = 'integration_delivery_outbox' AND resource_id = ?",
      [deliveryId],
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("fails closed without the J20 homologation gate", async () => {
    const actorUserId = await seedJ20Administrator(tenantA);
    const { deliveryId } = await seedJ20Leased(tenantA);
    await expect(createIntegrationRecoveryAuditedMySqlService(
      drizzle({ client: await connection() }), () => NOW + 1001,
    ).quarantineExpired({
      authenticatedActorUserId: actorUserId,
      resolvedOrganizationId: tenantA, deliveryId, expectedVersion: 1,
      reasonCode: "delivery_outcome_unknown", ticketReference: "INC-12345",
      operatorApproved: true,
    })).rejects.toThrow(/desabilitada/i);
    expect(await state(deliveryId)).toMatchObject({ status: "leased", version: 1 });
  });
});

describe("D-012J J21 — prova física de auditoria sem replay", () => {
  it("verifica quarentena J20 com auditoria atômica e protege leitura entre tenants", async () => {
    enableJ20();
    const actorUserId = await seedJ20Administrator(tenantA);
    const { deliveryId } = await seedJ20Leased(tenantA);
    const writer = createIntegrationRecoveryAuditedMySqlService(
      drizzle({ client: await connection() }), () => NOW + 1001,
    );
    await writer.quarantineExpired({
      authenticatedActorUserId: actorUserId,
      resolvedOrganizationId: tenantA, deliveryId, expectedVersion: 1,
      reasonCode: "delivery_outcome_unknown",
      ticketReference: "INC-20260", operatorApproved: true,
    });
    const verifier = createIntegrationRecoveryAuditVerifier(
      drizzle({ client: await connection() }),
    );
    expect(await verifier.verify({
      organizationId: tenantA, deliveryId,
    })).toEqual({
      organizationId: tenantA, deliveryId,
      status: "verified", permitsReplay: false,
    });
    expect(await verifier.verify({
      organizationId: tenantB, deliveryId,
    })).toEqual({
      organizationId: tenantB, deliveryId,
      status: "not_found", permitsReplay: false,
    });
  });

  it("classifica a quarentena J17 sem recibo atômico como missing, nunca como replay liberado", async () => {
    const { deliveryId, next } = await seedJ20Leased(tenantA);
    expect(await recovery(control).quarantineExpired({
      organizationId: tenantA, deliveryId, expectedVersion: 1,
      current: next, nowEpochMs: NOW + 1001,
    })).toBe(true);
    expect(await createIntegrationRecoveryAuditVerifier(
      drizzle({ client: await connection() }),
    ).verify({ organizationId: tenantA, deliveryId })).toEqual({
      organizationId: tenantA, deliveryId,
      status: "missing", permitsReplay: false,
    });
  });

  it("rejeita auditoria adulterada após commit, sem realizar mutação no diagnóstico", async () => {
    enableJ20();
    const actorUserId = await seedJ20Administrator(tenantA);
    const { deliveryId } = await seedJ20Leased(tenantA);
    await createIntegrationRecoveryAuditedMySqlService(
      drizzle({ client: await connection() }), () => NOW + 1001,
    ).quarantineExpired({
      authenticatedActorUserId: actorUserId,
      resolvedOrganizationId: tenantA, deliveryId, expectedVersion: 1,
      reasonCode: "lease_expired_after_disconnect",
      ticketReference: "OPS-20260", operatorApproved: true,
    });
    // Tampering only inside the disposable MySQL fixture; production data untouched.
    await control.execute(
      "UPDATE audit_logs SET after_data = JSON_SET(after_data, '$.correlationId', 'tampered') WHERE resource_type = 'integration_delivery_outbox' AND resource_id = ?",
      [deliveryId],
    );
    const verifier = createIntegrationRecoveryAuditVerifier(
      drizzle({ client: await connection() }),
    );
    expect(await verifier.verify({
      organizationId: tenantA, deliveryId,
    })).toMatchObject({ status: "inconsistent", permitsReplay: false });
    expect(await state(deliveryId)).toMatchObject({
      status: "dead_letter", version: 2,
    });
  });

  it("nega diagnóstico fora do gate de homologação, antes de buscar dados", async () => {
    const { deliveryId } = await seedJ20Leased(tenantA);
    vi.stubEnv("AXE_INTEGRATION_MYSQL_TESTS", "false");
    await expect(createIntegrationRecoveryAuditVerifier(
      drizzle({ client: await connection() }),
    ).verify({ organizationId: tenantA, deliveryId })).rejects.toThrow(/desabilitado/i);
    expect(await state(deliveryId)).toMatchObject({
      status: "leased", version: 1,
    });
  });
});

function enableJ23() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
  vi.stubEnv("AXE_INTEGRATION_OUTBOX_J23_ENABLED", "true");
}

describe("D-012J J23 — provas físicas MySQL do coordenador CAS", () => {
  it("permite um único claim concorrente tenant-scoped e bloqueia trabalhador obsoleto", async () => {
    enableJ23();
    const deliveryId = await insertDelivery(tenantA);
    const a = createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW,
    );
    const b = createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW,
    );
    const inputs = {
      organizationId: tenantA, deliveryId, leaseDurationMs: 1000,
    };
    const results = await Promise.allSettled([
      a.claim({ ...inputs, workerId: "j23-worker-a", leaseToken: randomUUID() }),
      b.claim({ ...inputs, workerId: "j23-worker-b", leaseToken: randomUUID() }),
    ]);
    const successful = results.filter(x => x.status === "fulfilled");
    expect(successful).toHaveLength(1);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
    expect(await state(deliveryId)).toMatchObject({
      organizationId: tenantA, status: "leased", version: 1, attempts: 1,
    });
    const lease = successful[0].status === "fulfilled" ? successful[0].value : null;
    expect(lease).not.toBeNull();
    await expect(createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW + 1000,
    ).resolve({
      organizationId: tenantA, deliveryId,
      workerId: lease!.leaseOwner!, leaseToken: lease!.leaseToken!,
      expectedVersion: 1, outcome: "delivered",
    })).rejects.toThrow(/expirad/i);
    expect(await state(deliveryId)).toMatchObject({
      status: "leased", version: 1, attempts: 1,
    });
  });

  it("fenceia tenant e versão em MySQL real e não envia comunicação externa", async () => {
    enableJ23();
    const deliveryId = await insertDelivery(tenantA);
    const coordinator = createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW,
    );
    await expect(coordinator.claim({
      organizationId: tenantB, deliveryId,
      workerId: "j23-worker", leaseToken: randomUUID(),
      leaseDurationMs: 1000,
    })).rejects.toThrow(/não encontrada|organização/i);
    expect(await state(deliveryId)).toMatchObject({ status: "pending", version: 0 });
    const token = randomUUID();
    await coordinator.claim({
      organizationId: tenantA, deliveryId,
      workerId: "j23-worker", leaseToken: token,
      leaseDurationMs: 1000,
    });
    await expect(createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW + 1,
    ).resolve({
      organizationId: tenantA, deliveryId,
      workerId: "j23-worker", leaseToken: token,
      expectedVersion: 2, outcome: "delivered",
    })).rejects.toThrow(/conflito/i);
    expect(await state(deliveryId)).toMatchObject({ status: "leased", version: 1 });
  });
});

describe("D-012J J25 — homologação MySQL da decisão unificada de falha", () => {
  it("persiste rate limit comprovadamente não aceito somente via fencing CAS e cooldown", async () => {
    enableJ23();
    const deliveryId = await insertDelivery(tenantA);
    const claimService = createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW,
    );
    const leased = await claimService.claim({
      organizationId: tenantA, deliveryId, workerId: "j25-worker",
      leaseToken: "j25-rate-limit-token", leaseDurationMs: 120_000,
    });
    const decision = planIntegrationFailureResolution({
      organizationId: tenantA,
      current: leased, expectedVersion: leased.version,
      nowEpochMs: NOW + 1_000, failureKind: "rate_limited",
      remoteAcceptance: "confirmed_not_accepted",
      circuit: { state: "closed", openedAtEpochMs: null },
      consecutiveFailures: 1, baseDelayMs: 1_000,
    });
    expect(decision).toMatchObject({
      disposition: "schedule_retry", permitsExternalCall: false,
      transition: { outcome: "retry", nextAttemptAtMs: NOW + 31_000 },
    });
    const resolution = await createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW + 1_000,
    ).resolve({
      organizationId: tenantA, deliveryId,
      workerId: "j25-worker", leaseToken: "j25-rate-limit-token",
      expectedVersion: leased.version, ...decision.transition,
    });
    expect(resolution).toMatchObject({
      status: "pending", version: 2, attempts: 1,
      nextAttemptAtMs: NOW + 31_000, lastFailureKind: "rate_limited",
    });
    expect(await state(deliveryId)).toMatchObject({
      status: "pending", version: 2, attempts: 1, leaseToken: null,
    });
    await expect(createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW + 30_999,
    ).claim({
      organizationId: tenantA, deliveryId, workerId: "j25-early-worker",
      leaseToken: "j25-too-early", leaseDurationMs: 1000,
    })).rejects.toThrow(/elegível|agendada/i);
    expect(await state(deliveryId)).toMatchObject({
      status: "pending", version: 2, attempts: 1,
    });
  });

  it("registra resultado remoto incerto como DLQ sem reenvio ou atualização em outro tenant", async () => {
    enableJ23();
    const deliveryId = await insertDelivery(tenantA);
    const leased = await createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW,
    ).claim({
      organizationId: tenantA, deliveryId, workerId: "j25-uncertain-worker",
      leaseToken: "j25-uncertain-token", leaseDurationMs: 120_000,
    });
    expect(() => planIntegrationFailureResolution({
      organizationId: tenantB, current: leased, expectedVersion: leased.version,
      nowEpochMs: NOW + 1_000, failureKind: "timeout",
      remoteAcceptance: "outcome_unknown",
      circuit: { state: "closed", openedAtEpochMs: null },
      consecutiveFailures: 1, baseDelayMs: 1_000,
    })).toThrow(/tenant/i);
    const decision = planIntegrationFailureResolution({
      organizationId: tenantA, current: leased, expectedVersion: leased.version,
      nowEpochMs: NOW + 1_000, failureKind: "timeout",
      remoteAcceptance: "outcome_unknown",
      circuit: { state: "closed", openedAtEpochMs: null },
      consecutiveFailures: 1, baseDelayMs: 1_000,
    });
    expect(decision).toMatchObject({
      disposition: "quarantine", reason: "outcome_uncertain",
      permitsAutomaticReplay: false,
      transition: { outcome: "dead_letter", failureKind: "unknown" },
    });
    const committed = await createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW + 1_000,
    ).resolve({
      organizationId: tenantA, deliveryId,
      workerId: "j25-uncertain-worker", leaseToken: "j25-uncertain-token",
      expectedVersion: 1, ...decision.transition,
    });
    expect(committed).toMatchObject({
      status: "dead_letter", version: 2, attempts: 1,
      lastFailureKind: "unknown",
    });
    expect(await state(deliveryId)).toMatchObject({
      organizationId: tenantA, status: "dead_letter", version: 2, attempts: 1,
    });
    await expect(createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW + 3_000,
    ).claim({
      organizationId: tenantA, deliveryId,
      workerId: "j25-retry-forbidden", leaseToken: "j25-forbidden",
      leaseDurationMs: 1000,
    })).rejects.toThrow(/pending/i);
  });

  it("falha a resolução ao perder a versão CAS após planejamento; sem mutação adicional", async () => {
    enableJ23();
    const deliveryId = await insertDelivery(tenantA);
    const token = randomUUID();
    const leased = await createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW,
    ).claim({
      organizationId: tenantA, deliveryId, workerId: "j25-version-worker",
      leaseToken: token, leaseDurationMs: 120_000,
    });
    const decision = planIntegrationFailureResolution({
      organizationId: tenantA, current: leased, expectedVersion: 1,
      nowEpochMs: NOW + 1_000, failureKind: "unavailable",
      remoteAcceptance: "confirmed_not_accepted",
      circuit: { state: "closed", openedAtEpochMs: null },
      consecutiveFailures: 1, baseDelayMs: 1000,
    });
    const coordinator = createIntegrationOutboxCasCoordinator(
      storage(await connection()), () => NOW + 1_000,
    );
    await coordinator.resolve({
      organizationId: tenantA, deliveryId,
      workerId: "j25-version-worker", leaseToken: token,
      expectedVersion: 1, ...decision.transition,
    });
    await expect(coordinator.resolve({
      organizationId: tenantA, deliveryId,
      workerId: "j25-version-worker", leaseToken: token,
      expectedVersion: 1, ...decision.transition,
    })).rejects.toThrow(/conflito/i);
    expect(await state(deliveryId)).toMatchObject({
      status: "pending", version: 2, attempts: 1,
    });
  });
});
