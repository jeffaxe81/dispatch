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

/**
 * Read-only MySQL adapter for the opt-in J33 internal diagnostic. Query by
 * organization AND system; resolve audit resourceId only from that row.
 * Never select probe tokens, adapter payloads or actor personal data.
 */
export function createIntegrationProbeAuditMySqlReader(db: IntegrationDb): ProbeAuditReader {
  return Object.freeze({
    async load(input) {
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
    },
    async readAudit(input) {
      const rows = await db.select({
        resourceId: auditLogs.resourceId,
        action: auditLogs.action,
        beforeData: auditLogs.beforeData,
        afterData: auditLogs.afterData,
      }).from(auditLogs).where(and(
        eq(auditLogs.resourceType, "integration_circuit_state"),
        eq(auditLogs.resourceId, input.resourceId),
        inArray(auditLogs.action, actions),
      )).orderBy(desc(auditLogs.id)).limit(J33_MAX_AUDIT_ROWS);
      return rows.map(row => ({
        resourceId: row.resourceId,
        action: row.action,
        // Invalid/absent projections cannot be classified as verified evidence.
        beforeData: row.beforeData ?? {},
        afterData: row.afterData ?? {},
      }));
    },
  });
}
