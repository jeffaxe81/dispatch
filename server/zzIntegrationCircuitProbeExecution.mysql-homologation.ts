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

const NOW = Date.parse("2026-10-23T16:00:00.000Z");
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
function storage(client: Connection) {
  return createIntegrationCircuitMySqlStorage(drizzle({ client }));
}

beforeAll(async () => {
  control = await connection();
  await migrate(drizzle({ client: control }), { migrationsFolder: "drizzle" });
  const [org] = await control.execute<ResultSetHeader>(
    "INSERT INTO organizations (code, name) VALUES (?, 'J31 probe intent fixture')",
    ["j31-" + randomUUID().slice(0, 8)],
  );
  tenantId = org.insertId;
});
afterAll(async () => {
  for (const client of connections) {
    await client.rollback().catch(() => {});
    await client.end().catch(() => {});
  }
});

describe("D-012J J31 — intenção one-shot em MySQL 8.4", () => {
  it("permite exatamente um consumidor CAS do token persistido", async () => {
    const lease = "lease-" + randomUUID();
    const execution = "exec-" + randomUUID();
    await control.execute(
      `INSERT INTO integration_circuit_state
        (organization_id, system, state, circuit_version, consecutive_failures,
         opened_at_ms, cooldown_until_ms, probe_lease_owner, probe_lease_token, probe_lease_expires_at_ms,
         probe_execution_token, probe_execution_expires_at_ms, probe_execution_consumed_at_ms)
       VALUES (?, 'neo', 'half_open', 6, 3, ?, ?, 'j31-worker', ?, ?, NULL, NULL, NULL)`,
      [tenantId, NOW - 30_000, NOW - 1_000, lease, NOW + 60_000],
    );

    const issuer = createIntegrationCircuitCoordinator(storage(await connection()), () => NOW);
    const issued = await issuer.issueProbeExecutionIntent({
      organizationId: tenantId,
      system: "neo",
      expectedVersion: 6,
      leaseToken: lease,
      executionToken: execution,
      executionDurationMs: 10_000,
    });
    expect(issued).toMatchObject({ version: 7, permitsProbe: false });

    const a = createIntegrationCircuitCoordinator(storage(await connection()), () => NOW + 1_000);
    const b = createIntegrationCircuitCoordinator(storage(await connection()), () => NOW + 1_000);
    const input = {
      organizationId: tenantId,
      system: "neo" as const,
      expectedVersion: 7,
      leaseToken: lease,
      executionToken: execution,
    };
    const results = await Promise.allSettled([
      a.consumeProbeExecutionIntent(input),
      b.consumeProbeExecutionIntent(input),
    ]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
    const rejected = results.find(x => x.status === "rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(IntegrationCircuitCoordinatorConflictError);
    }

    const [rows] = await control.execute<RowDataPacket[]>(
      `SELECT circuit_version AS version,
              probe_execution_consumed_at_ms AS consumedAt
         FROM integration_circuit_state
        WHERE organization_id = ? AND system = 'neo'`,
      [tenantId],
    );
    expect(rows[0].version).toBe(8);
    expect(Number(rows[0].consumedAt)).toBe(NOW + 1_000);

    const [audits] = await control.execute<RowDataPacket[]>(
      `SELECT action, before_data AS beforeData, after_data AS afterData
         FROM audit_logs
        WHERE resource_type = 'integration_circuit_state'
          AND resource_id = (
            SELECT id FROM integration_circuit_state
             WHERE organization_id = ? AND system = 'neo'
          )
        ORDER BY id ASC`,
      [tenantId],
    );
    expect(audits.map(row => row.action)).toEqual([
      "integration.circuit.probe_intent.issued",
      "integration.circuit.probe_intent.consumed",
    ]);
    expect(JSON.stringify(audits)).not.toContain(lease);
    expect(JSON.stringify(audits)).not.toContain(execution);
  });
});
