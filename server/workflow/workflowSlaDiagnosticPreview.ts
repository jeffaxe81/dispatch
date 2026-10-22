import {
  evaluateWorkflowSlaReadiness,
  type WorkflowSlaHealthEvidence,
  type WorkflowSlaReadiness,
  type WorkflowSlaReadinessPolicy,
} from "./workflowSlaReadiness";
import type { WorkflowSlaOperationalMetrics } from "./workflowSlaOperationalMetrics";

export type ScopedSlaProbeEvidence = WorkflowSlaHealthEvidence & {
  organizationId: number;
};

export type SlaDiagnosticPreviewDependencies = {
  metrics(input: { organizationId: number; now: string }): Promise<WorkflowSlaOperationalMetrics>;
  schedulerProbe?: (input: { organizationId: number; now: string }) => Promise<ScopedSlaProbeEvidence>;
  adapterProbe?: (input: { organizationId: number; now: string }) => Promise<ScopedSlaProbeEvidence>;
};

export const SLA_DIAGNOSTIC_PREVIEW_POLICY: WorkflowSlaReadinessPolicy = Object.freeze({
  evidenceMaxAgeMs: 60_000,
  pendingWarning: 10,
  pendingCritical: 50,
  lagWarningMinutes: 15,
  lagCriticalMinutes: 60,
});

/** Homologation preview: never enabled in production or by client input. */
export function slaDiagnosticPreviewMode(
  env: Pick<NodeJS.ProcessEnv, "NODE_ENV" | "AXE_RUNTIME_ENV" | "AXE_SLA_READINESS_PREVIEW_ENABLED">,
): "disabled" | "manual_homologation" {
  return env.NODE_ENV !== "production" &&
    env.AXE_RUNTIME_ENV === "homologation" &&
    env.AXE_SLA_READINESS_PREVIEW_ENABLED === "true"
    ? "manual_homologation" : "disabled";
}

function positiveId(id: number): void {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Tenant de diagnóstico SLA inválido.");
}

function unknownEvidence(): WorkflowSlaHealthEvidence {
  return { state: "unknown", checkedAt: null };
}

async function safelyReadProbe(
  source: SlaDiagnosticPreviewDependencies["schedulerProbe"],
  input: { organizationId: number; now: string },
): Promise<WorkflowSlaHealthEvidence> {
  if (!source) return unknownEvidence();
  try {
    const evidence = await source(input);
    // An incorrect tenant is never allowed to furnish an apparent healthy probe.
    if (evidence.organizationId !== input.organizationId) return unknownEvidence();
    // Whitelist fields: tokens, URLs, credentials or exception messages must not escape.
    return { state: evidence.state, checkedAt: evidence.checkedAt };
  } catch {
    return unknownEvidence();
  }
}

/**
 * Passive SLA preview. The project currently has no attested scheduler or
 * delivery-adapter heartbeat. Both MUST remain unknown without live,
 * tenant-scoped probes wired by a future reviewed integration.
 *
 * Metrics come from the complete MySQL aggregation, not the capped UI list.
 * No worker, timer, scheduler run, delivery, replay, write or external network I/O.
 */
export async function evaluateSlaDiagnosticPreview(input: {
  organizationId: number;
  now: string;
  mode: "disabled" | "manual_homologation";
  dependencies: SlaDiagnosticPreviewDependencies;
  policy?: WorkflowSlaReadinessPolicy;
}): Promise<WorkflowSlaReadiness> {
  positiveId(input.organizationId);
  if (input.mode === "disabled") {
    // Never touch DB or sources in disabled mode.
    return evaluateWorkflowSlaReadiness({
      organizationId: input.organizationId, now: input.now, mode: "disabled",
    });
  }
  if (input.mode !== "manual_homologation") throw new Error("Modo SLA inválido.");
  const parameters = { organizationId: input.organizationId, now: input.now };
  const metrics = await input.dependencies.metrics(parameters);
  const [scheduler, adapter] = await Promise.all([
    safelyReadProbe(input.dependencies.schedulerProbe, parameters),
    safelyReadProbe(input.dependencies.adapterProbe, parameters),
  ]);
  return evaluateWorkflowSlaReadiness({
    organizationId: input.organizationId,
    now: input.now,
    mode: "manual_homologation",
    metrics,
    metricsOrganizationId: input.organizationId,
    scheduler,
    adapter,
    policy: input.policy ?? SLA_DIAGNOSTIC_PREVIEW_POLICY,
  });
}
