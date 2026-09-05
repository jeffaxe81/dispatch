export type WorkShiftAnomalyType =
  | "missing_start"
  | "missing_end"
  | "late_start"
  | "early_end"
  | "overtime"
  | "excessive_pause"
  | "schedule_divergence"
  | "other";

export type WorkShiftAnomalySeverity = "info" | "warning" | "critical";

export type WorkShiftPendingStatus =
  | "open"
  | "in_review"
  | "waiting_information"
  | "resolved"
  | "no_adjustment_required";

export interface WorkShiftPendingDedupeInput {
  tenantId: number | string;
  userId: number | string;
  anomalyType: WorkShiftAnomalyType;
  referenceId: string;
  windowKey: string;
}

export interface WorkShiftPendingTransition {
  status: WorkShiftPendingStatus;
  justification: string | null;
}

const terminalStatuses = new Set<WorkShiftPendingStatus>(["resolved", "no_adjustment_required"]);

export function buildWorkShiftPendingDedupeKey(input: WorkShiftPendingDedupeInput): string {
  return [input.tenantId, input.userId, input.anomalyType, input.referenceId, input.windowKey].join(":");
}

export function transitionWorkShiftPending(
  currentStatus: WorkShiftPendingStatus,
  nextStatus: WorkShiftPendingStatus,
  justification?: string | null,
): WorkShiftPendingTransition {
  if (terminalStatuses.has(currentStatus) && nextStatus === "open") {
    throw new Error("Uma pendência em estado terminal não pode ser reaberta diretamente.");
  }

  const normalizedJustification = justification?.trim() || null;
  if (terminalStatuses.has(nextStatus) && !normalizedJustification) {
    throw new Error("Justificativa é obrigatória para concluir a pendência.");
  }

  return { status: nextStatus, justification: normalizedJustification };
}
