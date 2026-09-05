import { buildWorkShiftPendingDedupeKey, type WorkShiftAnomalySeverity, type WorkShiftAnomalyType } from "./workShiftOperationsDomain";

export type WorkShiftOperationalEventType = "started" | "paused" | "resumed" | "ended" | string;
export type WorkShiftOperationalSnapshot = Record<string, string | number | boolean | null | undefined>;

export interface WorkShiftOperationalEvent {
  tenantId: number;
  userId: number;
  teamId: number | null;
  sessionId: number;
  eventType: WorkShiftOperationalEventType;
  occurredAt: Date;
  snapshot: WorkShiftOperationalSnapshot;
}

export interface WorkShiftAnomalyCandidate {
  tenantId: number;
  userId: number;
  teamId: number | null;
  anomalyType: WorkShiftAnomalyType;
  severity: WorkShiftAnomalySeverity;
  referenceId: string;
  windowKey: string;
  dedupeKey: string;
  detectedAt: Date;
  expected: Record<string, unknown>;
  observed: Record<string, unknown>;
}

function positiveNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function candidate(event: WorkShiftOperationalEvent, anomalyType: WorkShiftAnomalyType, severity: WorkShiftAnomalySeverity, expected: Record<string, unknown>, observed: Record<string, unknown>): WorkShiftAnomalyCandidate {
  const referenceId = `session:${event.sessionId}`;
  const windowKey = String(event.snapshot.scheduledStartAt ?? event.occurredAt.toISOString());
  return {
    tenantId: event.tenantId,
    userId: event.userId,
    teamId: event.teamId,
    anomalyType,
    severity,
    referenceId,
    windowKey,
    dedupeKey: buildWorkShiftPendingDedupeKey({ tenantId: event.tenantId, userId: event.userId, anomalyType, referenceId, windowKey }),
    detectedAt: event.occurredAt,
    expected,
    observed,
  };
}

export function detectEventAnomalies(event: WorkShiftOperationalEvent): WorkShiftAnomalyCandidate[] {
  const anomalies: WorkShiftAnomalyCandidate[] = [];
  const snapshot = event.snapshot;
  const lateStartSeconds = positiveNumber(snapshot.lateStartSeconds);
  const earlyEndSeconds = positiveNumber(snapshot.earlyEndSeconds);
  const overtimeSeconds = positiveNumber(snapshot.overtimeSeconds);
  const pausedSeconds = positiveNumber(snapshot.pausedSeconds);
  const breakPolicyMinutes = positiveNumber(snapshot.breakPolicyMinutes);

  if (event.eventType === "started" && lateStartSeconds > 0) {
    anomalies.push(candidate(event, "late_start", "warning", { scheduledStartAt: snapshot.scheduledStartAt ?? null }, { lateStartSeconds }));
  }
  if (event.eventType === "ended" && earlyEndSeconds > 0) {
    anomalies.push(candidate(event, "early_end", "warning", { scheduledEndAt: snapshot.scheduledEndAt ?? null }, { earlyEndSeconds }));
  }
  if (event.eventType === "ended" && overtimeSeconds > 0) {
    anomalies.push(candidate(event, "overtime", "warning", { scheduledEndAt: snapshot.scheduledEndAt ?? null }, { overtimeSeconds }));
  }
  if ((event.eventType === "resumed" || event.eventType === "ended") && breakPolicyMinutes > 0 && pausedSeconds > breakPolicyMinutes * 60) {
    anomalies.push(candidate(event, "excessive_pause", "warning", { breakPolicyMinutes }, { pausedSeconds }));
  }
  return anomalies;
}

export type WorkShiftOperationalEventPublisher = (event: WorkShiftOperationalEvent) => Promise<void>;
let operationalPublisher: WorkShiftOperationalEventPublisher | null = null;

export function configureWorkShiftOperationalEventPublisher(publisher: WorkShiftOperationalEventPublisher | null) {
  operationalPublisher = publisher;
}

export async function publishWorkShiftOperationalEvent(event: WorkShiftOperationalEvent): Promise<void> {
  if (!operationalPublisher) return;
  await operationalPublisher(event);
}
