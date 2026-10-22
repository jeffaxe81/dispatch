import type { WorkflowSlaOperationalMetrics } from "./workflowSlaOperationalMetrics";

/**
 * D-012J J5: diagnóstico passivo, sem I/O, timers, scheduler ou mutação.
 * O chamador deve fornecer evidências autenticadas, atuais e agregadas
 * exclusivamente para o tenant informado. Não inferir saúde de um probe ausente.
 */
export type WorkflowSlaEvidenceState = "healthy" | "degraded" | "unhealthy" | "unknown";
export type WorkflowSlaReadinessStatus = "disabled" | "ready" | "degraded" | "not_ready";
export type WorkflowSlaReadinessReason =
  | "feature_disabled"
  | "scheduler_unavailable"
  | "scheduler_degraded"
  | "adapter_unavailable"
  | "adapter_degraded"
  | "metrics_stale"
  | "pending_warning"
  | "pending_critical"
  | "lag_warning"
  | "lag_critical"
  | "expired_leases"
  | "dead_letter";

export type WorkflowSlaHealthEvidence = {
  state: WorkflowSlaEvidenceState;
  checkedAt: string | null;
};

export type WorkflowSlaReadinessPolicy = {
  evidenceMaxAgeMs: number;
  pendingWarning: number;
  pendingCritical: number;
  lagWarningMinutes: number;
  lagCriticalMinutes: number;
};

export type WorkflowSlaReadinessInput = {
  organizationId: number;
  mode: "disabled" | "manual_homologation";
  now: string;
  /** Must identify the tenant scope used to obtain metrics. */
  metricsOrganizationId?: number;
  metrics?: WorkflowSlaOperationalMetrics;
  scheduler?: WorkflowSlaHealthEvidence;
  adapter?: WorkflowSlaHealthEvidence;
  policy?: WorkflowSlaReadinessPolicy;
};

export type WorkflowSlaReadiness = {
  organizationId: number;
  status: WorkflowSlaReadinessStatus;
  evaluatedAt: string;
  components: {
    scheduler: WorkflowSlaEvidenceState;
    adapter: WorkflowSlaEvidenceState;
  };
  backlog: Pick<
    WorkflowSlaOperationalMetrics,
    "pending" | "leased" | "deadLetter" | "expiredLeases" |
    "waitingRetries" | "overdue" | "maxLagMinutes"
  > | null;
  reasons: WorkflowSlaReadinessReason[];
};

function positiveId(id: number, label: string): void {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`${label} inválido.`);
}

function strictUtc(value: string, label: string): number {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} deve ser ISO-8601 UTC com milissegundos.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 ||
    new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} contém calendário UTC inválido.`);
  }
  return timestamp;
}

function validatePolicy(policy: WorkflowSlaReadinessPolicy): void {
  for (const key of ["evidenceMaxAgeMs", "pendingWarning", "pendingCritical",
    "lagWarningMinutes", "lagCriticalMinutes"] as const) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1) {
      throw new Error("Política de readiness SLA inválida.");
    }
  }
  if (policy.pendingWarning >= policy.pendingCritical ||
    policy.lagWarningMinutes >= policy.lagCriticalMinutes) {
    throw new Error("Limites de readiness SLA fora de ordem.");
  }
}

function classifyEvidence(
  evidence: WorkflowSlaHealthEvidence,
  nowMs: number,
  maxAgeMs: number,
): WorkflowSlaEvidenceState {
  if (!evidence || !["healthy", "degraded", "unhealthy", "unknown"].includes(evidence.state)) {
    throw new Error("Estado da evidência SLA inválido.");
  }
  if (evidence.checkedAt === null) return "unknown";
  const checkedMs = strictUtc(evidence.checkedAt, "checkedAt");
  if (checkedMs > nowMs || nowMs - checkedMs > maxAgeMs) return "unknown";
  return evidence.state;
}

export function evaluateWorkflowSlaReadiness(
  input: WorkflowSlaReadinessInput,
): WorkflowSlaReadiness {
  positiveId(input.organizationId, "organizationId");
  const nowMs = strictUtc(input.now, "now");

  if (input.mode === "disabled") {
    return {
      organizationId: input.organizationId,
      status: "disabled",
      evaluatedAt: input.now,
      components: { scheduler: "unknown", adapter: "unknown" },
      backlog: null,
      reasons: ["feature_disabled"],
    };
  }
  if (input.mode !== "manual_homologation") {
    throw new Error("Modo de readiness SLA não autorizado.");
  }
  if (!input.metrics || !input.scheduler || !input.adapter || !input.policy ||
    input.metricsOrganizationId === undefined) {
    throw new Error("Evidências de readiness SLA incompletas.");
  }
  positiveId(input.metricsOrganizationId, "metricsOrganizationId");
  if (input.metricsOrganizationId !== input.organizationId) {
    throw new Error("Métricas SLA fora do tenant autorizado.");
  }
  validatePolicy(input.policy);
  const { metrics, policy } = input;
  const backlog = {
    pending: metrics.pending,
    leased: metrics.leased,
    deadLetter: metrics.deadLetter,
    expiredLeases: metrics.expiredLeases,
    waitingRetries: metrics.waitingRetries,
    overdue: metrics.overdue,
    maxLagMinutes: metrics.maxLagMinutes,
  };
  for (const value of Object.values(backlog)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Contadores de backlog SLA inválidos.");
    }
  }
  const metricsAtMs = strictUtc(metrics.generatedAt, "generatedAt");
  const metricsStale = metricsAtMs > nowMs ||
    nowMs - metricsAtMs > policy.evidenceMaxAgeMs;
  const scheduler = classifyEvidence(input.scheduler, nowMs, policy.evidenceMaxAgeMs);
  const adapter = classifyEvidence(input.adapter, nowMs, policy.evidenceMaxAgeMs);
  const reasons: WorkflowSlaReadinessReason[] = [];
  let level: 0 | 1 | 2 = 0; // ready, degraded, not_ready

  const add = (reason: WorkflowSlaReadinessReason, severity: 1 | 2) => {
    reasons.push(reason);
    if (severity > level) level = severity;
  };

  if (scheduler === "unhealthy" || scheduler === "unknown") add("scheduler_unavailable", 2);
  else if (scheduler === "degraded") add("scheduler_degraded", 1);

  if (adapter === "unhealthy" || adapter === "unknown") add("adapter_unavailable", 2);
  else if (adapter === "degraded") add("adapter_degraded", 1);

  if (metricsStale) add("metrics_stale", 2);
  if (backlog.pending >= policy.pendingCritical) add("pending_critical", 2);
  else if (backlog.pending >= policy.pendingWarning) add("pending_warning", 1);
  if (backlog.maxLagMinutes >= policy.lagCriticalMinutes) add("lag_critical", 2);
  else if (backlog.maxLagMinutes >= policy.lagWarningMinutes) add("lag_warning", 1);
  if (backlog.expiredLeases > 0) add("expired_leases", 1);
  if (backlog.deadLetter > 0) add("dead_letter", 1);

  const status: WorkflowSlaReadinessStatus =
    level === 2 ? "not_ready" : level === 1 ? "degraded" : "ready";
  return {
    organizationId: input.organizationId,
    status,
    evaluatedAt: input.now,
    components: { scheduler, adapter },
    backlog,
    reasons,
  };
}
