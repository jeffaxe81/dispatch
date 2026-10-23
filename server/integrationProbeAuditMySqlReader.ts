import { and, desc, eq, inArray } from "drizzle-orm";
import { integrationCircuitState } from "../drizzle/integrationCircuitSchema";
import { auditLogs } from "../drizzle/schema";
import type { getDb } from "./dbLegacy";
import {
  J33_MAX_AUDIT_ROWS,
  type ProbeAuditReader,
} from "./integrationProbeAuditReconciler";

type IntegrationDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;

const actions = [
  "integration.circuit.probe_intent.consumed",
  "integration.circuit.probe.succeeded",
  "integration.circuit.probe.failed",
];

async function loadState(db: IntegrationDb, input: { organizationId: number; system: any }) {
  const rows = await db.select({
    id: integrationCircuitState.id,
    organizationId: integrationCircuitState.organizationId,
    system: integrationCircuitState.system,
    state: integrationCircuitState.state,
    version: integrationCircuitState.circuitVersion,
    consecutiveFailures: integrationCircuitState.consecutiveFailures,
    executionConsumedAtMs: integrationCircuitState.probeExecutionConsumedAtMs,
  }).from(integrationCircuitState).where(and(
    eq(integrationCircuitState.organizationId, input.organizationId),
    eq(integrationCircuitState.system, input.system),
  )).limit(1);
  return rows[0] ?? null;
}

async function readAuditRows(db: IntegrationDb, resourceId: number) {
  const rows = await db.select({
    resourceId: auditLogs.resourceId,
    action: auditLogs.action,
    beforeData: auditLogs.beforeData,
    afterData: auditLogs.afterData,
  }).from(auditLogs).where(and(
    eq(auditLogs.resourceType, "integration_circuit_state"),
    eq(auditLogs.resourceId, resourceId),
    inArray(auditLogs.action, actions),
  )).orderBy(desc(auditLogs.id)).limit(J33_MAX_AUDIT_ROWS);
  return rows.map(row => ({
    resourceId: row.resourceId,
    action: row.action,
    beforeData: row.beforeData ?? {},
    afterData: row.afterData ?? {},
  }));
}

/**
 * Read-only MySQL adapter for the opt-in J33/J34 internal diagnostic.
 * J34 exposes a single transactional snapshot so state and audits are read
 * from the same MySQL transaction. No token, payload or external callback is
 * selected or executed.
 */
export function createIntegrationProbeAuditMySqlReader(db: IntegrationDb): ProbeAuditReader {
  return Object.freeze({
    async readConsistentSnapshot(input) {
      const transactional = db as IntegrationDb & {
        transaction?<T>(fn: (tx: IntegrationDb) => Promise<T>): Promise<T>;
      };
      if (typeof transactional.transaction !== "function") {
        throw new Error("Transação de leitura J34 indisponível.");
      }
      return transactional.transaction(async tx => {
        const state = await loadState(tx, input);
        if (state === null) return { state: null, entries: [] };
        const entries = await readAuditRows(tx, state.id);
        return { state, entries };
      });
    },
    async load(input) {
      return loadState(db, input);
    },
    async readAudit(input) {
      return readAuditRows(db, input.resourceId);
    },
  });
}
