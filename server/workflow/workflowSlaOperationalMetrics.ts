export type WorkflowSlaMetricRow = {
  status: "pending" | "leased" | "dead_letter";
  scheduledAt: string;
  leaseExpiresAtMs: number | null;
  nextAttemptAtMs: number | null;
};

export type WorkflowSlaOperationalMetrics = {
  pending: number;
  leased: number;
  deadLetter: number;
  expiredLeases: number;
  waitingRetries: number;
  overdue: number;
  maxLagMinutes: number;
  generatedAt: string;
};

function strictUtc(value: string, label: string): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(`${label} deve ser UTC ISO-8601 com milissegundos.`);
  }
  const timestamp = Date.parse(value);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    new Date(timestamp).toISOString() !== value
  ) {
    throw new Error(`${label} contém calendário UTC inválido.`);
  }
  return timestamp;
}

function optionalTimestampMs(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} inválido.`);
  }
  return value;
}

export function summarizeWorkflowSlaOperationalMetrics(
  rows: WorkflowSlaMetricRow[],
  now: string,
): WorkflowSlaOperationalMetrics {
  const nowMs = strictUtc(now, "now");
  const metrics: WorkflowSlaOperationalMetrics = {
    pending: 0,
    leased: 0,
    deadLetter: 0,
    expiredLeases: 0,
    waitingRetries: 0,
    overdue: 0,
    maxLagMinutes: 0,
    generatedAt: now,
  };

  for (const row of rows) {
    if (!["pending", "leased", "dead_letter"].includes(row.status)) {
      throw new Error("status SLA operacional inválido.");
    }

    const scheduledAtMs = strictUtc(row.scheduledAt, "scheduledAt");
    const leaseExpiresAtMs = optionalTimestampMs(row.leaseExpiresAtMs, "leaseExpiresAtMs");
    const nextAttemptAtMs = optionalTimestampMs(row.nextAttemptAtMs, "nextAttemptAtMs");

    if (row.status === "pending") metrics.pending += 1;
    if (row.status === "leased") metrics.leased += 1;
    if (row.status === "dead_letter") metrics.deadLetter += 1;

    if (
      row.status === "leased" &&
      leaseExpiresAtMs !== null &&
      leaseExpiresAtMs <= nowMs
    ) {
      metrics.expiredLeases += 1;
    }

    if (
      row.status === "pending" &&
      nextAttemptAtMs !== null &&
      nextAttemptAtMs > nowMs
    ) {
      metrics.waitingRetries += 1;
    }

    if (scheduledAtMs <= nowMs) {
      metrics.overdue += 1;
      const lagMinutes = Math.floor((nowMs - scheduledAtMs) / 60_000);
      if (lagMinutes > metrics.maxLagMinutes) metrics.maxLagMinutes = lagMinutes;
    }
  }

  return metrics;
}
