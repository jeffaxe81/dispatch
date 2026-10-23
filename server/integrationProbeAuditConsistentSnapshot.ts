import { and, desc, eq, inArray } from "drizzle-orm";
import { integrationCircuitState } from "../drizzle/integrationCircuitSchema";
import { auditLogs } from "../drizzle/schema";
import type { getDb } from "./dbLegacy";
import {
  J33_MAX_AUDIT_ROWS,
  classifyIntegrationProbeAudit,
  type CircuitProbeAuditEntry,
  type CircuitProbeAuditState,
  type ProbeAuditInput,
  type ProbeAuditResult,
} from "./integrationProbeAuditReconciler";

type IntegrationDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;

export type ProbeAuditConsistentSnapshot = Readonly<{
  state: CircuitProbeAuditState | null;
  entries: readonly CircuitProbeAuditEntry[];
}>;

export type ProbeAuditConsistentSnapshotReader = Readonly<{
  readSnapshot(input: Pick<ProbeAuditInput, "organizationId" | "system">):
    Promise<ProbeAuditConsistentSnapshot>;
}>;

const ACTIONS = [
  "integration.circuit.probe_intent.consumed",
  "integration.circuit.probe.succeeded",
  "integration.circuit.probe.failed",
];

const ALLOWED_SYSTEMS = new Set(["neo", "inventory", "crm"]);

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validInput(input: ProbeAuditInput): boolean {
  return !!input && validId(input.organizationId)
    && ALLOWED_SYSTEMS.has(input.system)
    && validId(input.expectedConsumedVersion)
    && input.expectedConsumedVersion < Number.MAX_SAFE_INTEGER;
}

function assertHomologationGate(): void {
  if (process.env.NODE_ENV !== "test"
    || process.env.AXE_RUNTIME_ENV !== "homologation"
    || process.env.AXE_INTEGRATION_PROBE_J34_ENABLED !== "true") {
    throw new Error("Diagnóstico J34 desabilitado fora da homologação opt-in.");
  }
}

/**
 * J34 read-only adapter. State and audit evidence are captured inside the same
 * database transaction so the classifier cannot combine two different moments.
 * No tokens, payloads, endpoints or actor data are selected.
 */
export function createIntegrationProbeAuditConsistentSnapshotReader(
  db: IntegrationDb,
): ProbeAuditConsistentSnapshotReader {
  if (!db || typeof (db as any).transaction !== "function") {
    throw new Error("Transação de banco indisponível para snapshot J34.");
  }

  return Object.freeze({
    async readSnapshot(input): Promise<ProbeAuditConsistentSnapshot> {
      return (db as any).transaction(async (tx: any) => {
        const stateRows = await tx.select({
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

        const state = stateRows[0] ?? null;
        if (state === null) {
          return Object.freeze({ state: null, entries: Object.freeze([]) });
        }

        const auditRows = await tx.select({
          resourceId: auditLogs.resourceId,
          action: auditLogs.action,
          beforeData: auditLogs.beforeData,
          afterData: auditLogs.afterData,
        }).from(auditLogs).where(and(
          eq(auditLogs.resourceType, "integration_circuit_state"),
          eq(auditLogs.resourceId, state.id),
          inArray(auditLogs.action, ACTIONS),
        )).orderBy(desc(auditLogs.id)).limit(J33_MAX_AUDIT_ROWS);

        const entries = auditRows.map((row: any) => Object.freeze({
          resourceId: row.resourceId,
          action: row.action,
          beforeData: row.beforeData ?? {},
          afterData: row.afterData ?? {},
        }));

        return Object.freeze({
          state: Object.freeze({ ...state }) as CircuitProbeAuditState,
          entries: Object.freeze(entries),
        });
      });
    },
  });
}

/**
 * J34 remains diagnostic-only. It consumes exactly one consistent snapshot and
 * delegates conservative classification to J33. It never grants probe/replay.
 */
export function createIntegrationProbeAuditConsistentReconciler(
  reader: ProbeAuditConsistentSnapshotReader,
) {
  if (!reader || typeof reader.readSnapshot !== "function") {
    throw new Error("Reader interno de snapshot J34 inválido.");
  }

  return Object.freeze({
    async reconcile(input: ProbeAuditInput): Promise<ProbeAuditResult> {
      assertHomologationGate();
      if (!validInput(input)) throw new Error("Escopo/versão J34 inválidos.");

      try {
        const snapshot = await reader.readSnapshot({
          organizationId: input.organizationId,
          system: input.system,
        });
        if (!snapshot || !Array.isArray(snapshot.entries)) {
          throw new Error("Snapshot J34 inválido.");
        }
        if (snapshot.state === null && snapshot.entries.length !== 0) {
          throw new Error("Snapshot J34 inconsistente.");
        }
        return classifyIntegrationProbeAudit(input, snapshot.state, snapshot.entries);
      } catch {
        throw new Error("Evidência J34 indisponível ou inconsistente.");
      }
    },
  });
}
