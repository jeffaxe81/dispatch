import type {
  WorkShiftAlertPolicy,
  WorkShiftAlertSeverity,
  WorkShiftAlertSnapshot,
  WorkShiftAlertType,
} from "../shared/workShiftAlerts";

export type WorkShiftAlertEvaluationContext = {
  evaluatedAt: Date;
  userId: number | null;
  teamId: number | null;
  sessionId: number | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  status: "active" | "paused" | "ended" | "cancelled" | null;
  pausedSeconds: number;
  availableForDispatch: boolean;
  legacyStateDivergence: boolean;
  coverageGap: boolean;
  policy: WorkShiftAlertPolicy;
};

function elapsedSeconds(from: Date | null, to: Date) {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function severityFor(type: WorkShiftAlertType): WorkShiftAlertSeverity {
  switch (type) {
    case "COVERAGE_GAP":
    case "LEGACY_SHIFT_STATE_DIVERGENCE":
      return "critical";
    case "SHIFT_NOT_STARTED_NEAR_PLANNED_TIME":
    case "LATE_START":
    case "PAUSE_EXCEEDED":
    case "SHIFT_OVERRUN":
    case "SHIFT_NOT_ENDED":
    case "AVAILABLE_OUTSIDE_SHIFT":
    case "DISPATCH_EXCLUDED_BY_SHIFT":
      return "warning";
  }
}

function dedupeKey(type: WorkShiftAlertType, context: WorkShiftAlertEvaluationContext) {
  return [
    type,
    context.userId ?? "no-user",
    context.teamId ?? "no-team",
    context.sessionId ?? "no-session",
    context.plannedStartAt?.toISOString() ?? "no-plan",
  ].join(":");
}

function alert(type: WorkShiftAlertType, context: WorkShiftAlertEvaluationContext, metadata: Record<string, unknown> = {}): WorkShiftAlertSnapshot {
  return {
    type,
    severity: severityFor(type),
    status: "open",
    dedupeKey: dedupeKey(type, context),
    userId: context.userId,
    teamId: context.teamId,
    sessionId: context.sessionId,
    detectedAt: context.evaluatedAt,
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    resolvedAt: null,
    resolvedByUserId: null,
    metadata,
  };
}

export function evaluateWorkShiftAlerts(context: WorkShiftAlertEvaluationContext): WorkShiftAlertSnapshot[] {
  const alerts: WorkShiftAlertSnapshot[] = [];
  const afterPlannedStart = elapsedSeconds(context.plannedStartAt, context.evaluatedAt);
  const afterPlannedEnd = elapsedSeconds(context.plannedEndAt, context.evaluatedAt);

  if (
    context.plannedStartAt &&
    !context.actualStartAt &&
    context.evaluatedAt >= context.plannedStartAt &&
    afterPlannedStart >= context.policy.notStartedGraceSeconds
  ) {
    alerts.push(alert("SHIFT_NOT_STARTED_NEAR_PLANNED_TIME", context, { overdueSeconds: afterPlannedStart }));
  }

  if (
    context.plannedStartAt &&
    context.actualStartAt &&
    context.actualStartAt.getTime() > context.plannedStartAt.getTime()
  ) {
    const lateSeconds = Math.floor((context.actualStartAt.getTime() - context.plannedStartAt.getTime()) / 1000);
    if (lateSeconds >= context.policy.lateStartThresholdSeconds) {
      alerts.push(alert("LATE_START", context, { lateSeconds }));
    }
  }

  if (context.status === "paused" && context.pausedSeconds >= context.policy.pauseExceededSeconds) {
    alerts.push(alert("PAUSE_EXCEEDED", context, { pausedSeconds: context.pausedSeconds }));
  }

  if (
    context.plannedEndAt &&
    !context.actualEndAt &&
    context.evaluatedAt > context.plannedEndAt &&
    afterPlannedEnd >= context.policy.shiftOverrunSeconds
  ) {
    alerts.push(alert("SHIFT_OVERRUN", context, { overrunSeconds: afterPlannedEnd }));
  }

  if (
    context.plannedEndAt &&
    !context.actualEndAt &&
    (context.status === "active" || context.status === "paused") &&
    context.evaluatedAt > context.plannedEndAt &&
    afterPlannedEnd >= context.policy.notEndedGraceSeconds
  ) {
    alerts.push(alert("SHIFT_NOT_ENDED", context, { overdueSeconds: afterPlannedEnd }));
  }

  if (context.coverageGap) alerts.push(alert("COVERAGE_GAP", context));
  if (context.availableForDispatch && context.status !== "active" && context.status !== "paused") {
    alerts.push(alert("AVAILABLE_OUTSIDE_SHIFT", context));
  }
  if (context.legacyStateDivergence) alerts.push(alert("LEGACY_SHIFT_STATE_DIVERGENCE", context));

  return alerts;
}

export function acknowledgeWorkShiftAlert(
  current: WorkShiftAlertSnapshot,
  input: { actorUserId: number; at: Date },
): WorkShiftAlertSnapshot {
  if (current.status === "resolved") return current;
  if (current.status === "acknowledged") return current;
  return {
    ...current,
    status: "acknowledged",
    acknowledgedAt: input.at,
    acknowledgedByUserId: input.actorUserId,
  };
}

export function resolveWorkShiftAlert(
  current: WorkShiftAlertSnapshot,
  input: { actorUserId: number; at: Date },
): WorkShiftAlertSnapshot {
  if (current.status === "resolved") return current;
  return {
    ...current,
    status: "resolved",
    resolvedAt: input.at,
    resolvedByUserId: input.actorUserId,
  };
}
