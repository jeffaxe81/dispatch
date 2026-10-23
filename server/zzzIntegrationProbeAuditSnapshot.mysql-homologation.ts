import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createConnection, type Connection } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getIntegrationOutboxMysqlSettings } from "./test/integrationOutboxMysqlEnvironment";
import {
  createIntegrationProbeAuditConsistentReconciler,
  createIntegrationProbeAuditConsistentSnapshotReader,
} from "./integrationProbeAuditConsistentSnapshot";

const settings = getIntegrationOutboxMysqlSettings(process.env);
const connections = new Set<Connection>();
let control: Connection;
let tenantId: number;
let resourceId: number;
const previousEnabled = process.env.AXE_INTEGRATION_PROBE_J34_ENABLED;

async function connection(): Promise<Connection> {
  const client = await createConnection(settings);
  connections.add(client);
  await client.query("SET SESSION time_zone = '+00:00'");
  return client;
}

beforeAll(async () => {
  control = await connection();
  await migrate(drizzle({ client: control }), { migrationsFolder: "drizzle" });

  const [org] = await control.execute<ResultSetHeader>(
    "INSERT INTO organizations (code, name) VALUES (?, 'J35 snapshot fixture')",
    ["j35-" + randomUUID().slice(0, 8)],
  );
  tenantId = org.insertId;

  const [circuit] = await control.execute<ResultSetHeader>(
    `INSERT INTO integration_circuit_state
      (`organization_id`, `system`, `state`, `circuit_version`, `consecutive_failures`,
       `probe_execution_consumed_at_ms`)
     VALUES (?, 'neo', 'closed', 9, 0, NULL)`,
    [tenantId],
  );
  resourceId = circuit.insertId;

  await control.execute(
    `INSERT INTO audit_logs
      (resource_type, resource_id, action, before_data, after_data)
     VALUES
      ('integration_circuit_state', ?, 'integration.circuit.probe_intent.consumed',
       JSON_OBJECT('organizationId', ?, 'system', 'neo', 'state', 'half_open', 'version', 7, 'consecutiveFailures', 3),
       JSON_OBJECT('organizationId', ?, 'system', 'neo', 'state', 'half_open', 'version', 8, 'consecutiveFailures', 3)),
      ('integration_circuit_state', ?, 'integration.circuit.probe.succeeded',
       JSON_OBJECT('organizationId', ?, 'system', 'neo', 'state', 'half_open', 'version', 8, 'consecutiveFailures', 3),
       JSON_OBJECT('organizationId', ?, 'system', 'neo', 'state', 'closed', 'version', 9, 'consecutiveFailures', 0))`,
    [resourceId, tenantId, tenantId, resourceId, tenantId, tenantId],
  );

  process.env.AXE_INTEGRATION_PROBE_J34_ENABLED = "true";
});

afterAll(async () => {
  if (previousEnabled === undefined) delete process.env.AXE_INTEGRATION_PROBE_J34_ENABLED;
  else process.env.AXE_INTEGRATION_PROBE_J34_ENABLED = previousEnabled;
  for (const client of connections) {
    await client.rollback().catch(() => {});
    await client.end().catch(() => {});
  }
  connections.clear();
});

describe("D-012J J35 — snapshot J34 em MySQL 8.4", () => {
  it("reconcilia circuito e auditorias reais no mesmo snapshot sem liberar efeitos externos", async () => {
    const db = drizzle({ client: await connection() });
    const reader = createIntegrationProbeAuditConsistentSnapshotReader(db as any);
    const result = await createIntegrationProbeAuditConsistentReconciler(reader).reconcile({
      organizationId: tenantId,
      system: "neo",
      expectedConsumedVersion: 8,
    });

    expect(result).toEqual({
      organizationId: tenantId,
      system: "neo",
      expectedConsumedVersion: 8,
      status: "circuit_closed_verified",
      permitsReplay: false,
      permitsProbe: false,
      permitsExternalCall: false,
      permitsAutomaticReplay: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/token|secret|payload|endpoint/i);
  });

  it("não atravessa tenant ao consultar o mesmo sistema", async () => {
    const db = drizzle({ client: await connection() });
    const reader = createIntegrationProbeAuditConsistentSnapshotReader(db as any);
    const result = await createIntegrationProbeAuditConsistentReconciler(reader).reconcile({
      organizationId: tenantId + 1_000_000,
      system: "neo",
      expectedConsumedVersion: 8,
    });

    expect(result.status).toBe("not_found");
    expect(result.permitsExternalCall).toBe(false);
    expect(result.permitsReplay).toBe(false);
  });
});
