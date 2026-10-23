import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createConnection, type Connection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getIntegrationOutboxMysqlSettings } from "./test/integrationOutboxMysqlEnvironment";
import {
  createIntegrationCircuitCoordinator,
  IntegrationCircuitCoordinatorConflictError,
} from "./integrationCircuitCoordinator";
import { createIntegrationCircuitMySqlStorage } from "./integrationCircuitMySqlStorage";

const NOW = Date.parse("2026-10-23T02:00:00.000Z");
const settings = getIntegrationOutboxMysqlSettings(process.env);
const connections = new Set<Connection>();
let control: Connection;
let tenantId: number;

async function connection(): Promise<Connection> {
  const client = await createConnection(settings);
  connections.add(client);
  await client.query("SET SESSION time_zone = '+00:00'");
  await client.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await client.query("SET SESSION innodb_lock_wait_timeout = 4");
  return client;
}

function circuitStorage(client: Connection) {
  return createIntegrationCircuitMySqlStorage(drizzle({ client }));
}

async function seedLeasedHalfOpen(system: "neo" | "inventory" | "crm", token: string) {
  const [res] = await control.execute<ResultSetHeader>(
    `INSERT INTO integration_circuit_state
      (\`organization_id\`, \`system\`, \`state\`, \`circuit_version\`, \`consecutive_failures\`,
       \`opened_at_ms\`, \`cooldown_until_ms\`, \`probe_lease_owner\`, \`probe_lease_token\`, \`probe_lease_expires_at_ms\`)
     VALUES (?, ?, 'half_open', 6, 3, ?, ?, 'j29-worker', ?, ?)`,
    [tenantId, system, NOW - 30_000, NOW - 1_000, token, NOW + 60_000],
  );
  expect(res.insertId).toBeGreaterThan(0);
  return res.insertId;
}

async function circuitRow(system: string) {
  const [rows] = await control.execute<RowDataPacket[]>(
    `SELECT \`state\`, \`circuit_version\` AS version, \`consecutive_failures\` AS failures,
            \`opened_at_ms\` AS openedAtMs, \`cooldown_until_ms\` AS cooldownUntilMs,
            \`probe_lease_owner\` AS leaseOwner, \`probe_lease_token\` AS leaseToken,
            \`probe_lease_expires_at_ms\` AS leaseExpiresAtMs
       FROM integration_circuit_state
      WHERE \`organization_id\` = ? AND \`system\` = ?`,
    [tenantId, system],
  );
  return rows[0];
}

beforeAll(async () => {
  control = await connection();
  await migrate(drizzle({ client: control }), { migrationsFolder: "drizzle" });
  const [org] = await control.execute<ResultSetHeader>(
    "INSERT INTO organizations (code, name) VALUES (?, 'J29 circuit fixture')",
    ["j29-" + randomUUID().slice(0, 8)],
  );
  tenantId = org.insertId;
});

afterAll(async () => {
  for (const client of connections) {
    await client.rollback().catch(() => {});
    await client.end().catch(() => {});
  }
  connections.clear();
});

describe("D-012J J29 — resolução fenced do probe em MySQL 8.4", () => {
  it("fecha o circuito, limpa o lease e grava auditoria sanitizada em sucesso", async () => {
    const token = "j29-success-" + randomUUID();
    const resourceId = await seedLeasedHalfOpen("neo", token);
    const coordinator = createIntegrationCircuitCoordinator(
      circuitStorage(await connection()), () => NOW,
    );

    const result = await coordinator.resolveProbe({
      organizationId: tenantId,
      system: "neo",
      expectedVersion: 6,
      leaseToken: token,
      outcome: "success",
      cooldownSeconds: 30,
    });

    expect(result).toMatchObject({
      state: "closed",
      version: 7,
      consecutiveFailures: 0,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAtMs: null,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(await circuitRow("neo")).toMatchObject({
      state: "closed",
      version: 7,
      failures: 0,
      openedAtMs: null,
      cooldownUntilMs: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAtMs: null,
    });

    const [audits] = await control.execute<RowDataPacket[]>(
      "SELECT action, before_data AS beforeData, after_data AS afterData FROM audit_logs WHERE resource_type = 'integration_circuit_state' AND resource_id = ?",
      [resourceId],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("integration.circuit.probe.succeeded");
    expect(JSON.stringify(audits[0])).not.toContain(token);
    expect(JSON.stringify(audits[0])).not.toMatch(/leaseOwner|authorization|payload/i);
  });

  it("reabre com novo cooldown e limpa o lease quando o probe falha", async () => {
    const token = "j29-failure-" + randomUUID();
    await seedLeasedHalfOpen("inventory", token);
    const coordinator = createIntegrationCircuitCoordinator(
      circuitStorage(await connection()), () => NOW,
    );

    const result = await coordinator.resolveProbe({
      organizationId: tenantId,
      system: "inventory",
      expectedVersion: 6,
      leaseToken: token,
      outcome: "failure",
      cooldownSeconds: 30,
    });

    expect(result).toMatchObject({
      state: "open",
      version: 7,
      consecutiveFailures: 4,
      openedAtMs: NOW,
      cooldownUntilMs: NOW + 30_000,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAtMs: null,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(await circuitRow("inventory")).toMatchObject({
      state: "open",
      version: 7,
      failures: 4,
      openedAtMs: NOW,
      cooldownUntilMs: NOW + 30_000,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAtMs: null,
    });
  });

  it("permite um único vencedor CAS quando dois resolvedores usam o mesmo lease", async () => {
    const token = "j29-race-" + randomUUID();
    await seedLeasedHalfOpen("crm", token);
    const a = createIntegrationCircuitCoordinator(
      circuitStorage(await connection()), () => NOW,
    );
    const b = createIntegrationCircuitCoordinator(
      circuitStorage(await connection()), () => NOW,
    );
    const input = {
      organizationId: tenantId,
      system: "crm" as const,
      expectedVersion: 6,
      leaseToken: token,
      outcome: "success" as const,
      cooldownSeconds: 30,
    };

    const results = await Promise.allSettled([
      a.resolveProbe(input),
      b.resolveProbe(input),
    ]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
    const rejected = results.find(x => x.status === "rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(IntegrationCircuitCoordinatorConflictError);
    }
    expect(await circuitRow("crm")).toMatchObject({
      state: "closed",
      version: 7,
      failures: 0,
      leaseToken: null,
    });
  });
});
