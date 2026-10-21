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

export function summarizeWorkflowSlaOperationalMetrics(
  _rows: WorkflowSlaMetricRow[],
  _now: string,
): WorkflowSlaOperationalMetrics {
  throw new Error("D-012J J3 metrics ainda não implementadas.");
}
