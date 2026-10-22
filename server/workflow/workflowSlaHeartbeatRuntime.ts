import { getDb } from "../dbLegacy";
import { createSlaHeartbeatMySqlStore } from "./workflowSlaHeartbeatMySql";
import {
  createSlaAuthenticatedHeartbeatProbe,
  slaHeartbeatReadAllowed,
} from "./workflowSlaHeartbeatBridge";
import type { SlaHeartbeatComponent } from "./workflowSlaSignedHeartbeat";
import type { ScopedSlaProbeEvidence } from "./workflowSlaDiagnosticPreview";

const sources: Record<SlaHeartbeatComponent, string> = {
  scheduler: "AXE_SLA_HEARTBEAT_SOURCE_SCHEDULER",
  adapter: "AXE_SLA_HEARTBEAT_SOURCE_ADAPTER",
};

/**
 * Production code uses only server-owned configuration for one explicitly
 * approved homologation tenant. This does not create or run any emitter.
 * Fail closed for other tenants, missing config or missing migration.
 */
export async function probeSlaRuntimeHeartbeat(input: {
  organizationId: number;
  component: SlaHeartbeatComponent;
  now: string;
}, environment: Record<string, string | undefined> = process.env): Promise<ScopedSlaProbeEvidence> {
  const unknown: ScopedSlaProbeEvidence = {
    organizationId: input.organizationId, state: "unknown", checkedAt: null,
  };
  if (!Number.isSafeInteger(input.organizationId) || input.organizationId < 1 ||
    !["scheduler", "adapter"].includes(input.component)) {
    throw new Error("Escopo SLA inválido.");
  }
  if (!slaHeartbeatReadAllowed(environment)) return unknown();
  const targetTenant = Number(environment.AXE_SLA_HEARTBEAT_TENANT_ID);
  const approvedSource = environment[sources[input.component]];
  if (!Number.isSafeInteger(targetTenant) || targetTenant !== input.organizationId ||
    !approvedSource) return unknown();
  try {
    const db = await getDb();
    if (!db) return unknown();
    return createSlaAuthenticatedHeartbeatProbe({
      store: createSlaHeartbeatMySqlStore(db),
      environment,
      resolveSource: async ({ organizationId, component }) =>
        organizationId === targetTenant ? environment[sources[component]] ?? null : null,
    })(input);
  } catch {
    return unknown();
  }
}
