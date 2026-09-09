import type { RecoveryExecutionRequest } from "./recoveryExecution";

export type RecoveryExecutionAuditStatus = "executed" | "rejected" | "failed";

export type RecoveryExecutionSanitizedFailure = Readonly<{
  status: "failed";
  reasonCode: "INTERNAL_SANITIZED_FAILURE";
}>;

export type RecoveryExecutionAuditEvent = Readonly<{
  eventType: "recovery.execution.finished";
  actionId: string;
  componentId: string;
  action: RecoveryExecutionRequest["action"];
  correlationId: string;
  fencingToken: number;
  startedAt: string;
  finishedAt: string;
  status: RecoveryExecutionAuditStatus;
  reasonCode: string;
}>;

export type RecoveryExecutionAuditPort = Readonly<{
  append(event: RecoveryExecutionAuditEvent): Promise<void>;
}>;

export function sanitizeRecoveryExecutionFailure(_error: unknown): RecoveryExecutionSanitizedFailure {
  return {
    status: "failed",
    reasonCode: "INTERNAL_SANITIZED_FAILURE",
  };
}

export function buildRecoveryExecutionAuditEvent(input: {
  request: RecoveryExecutionRequest;
  startedAt: string;
  finishedAt: string;
  status: RecoveryExecutionAuditStatus;
  reasonCode: string;
}): RecoveryExecutionAuditEvent {
  return {
    eventType: "recovery.execution.finished",
    actionId: input.request.actionId,
    componentId: input.request.componentId,
    action: input.request.action,
    correlationId: input.request.correlationId,
    fencingToken: input.request.fencingToken,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    status: input.status,
    reasonCode: input.reasonCode,
  };
}
