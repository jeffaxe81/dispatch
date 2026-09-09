import { createHash } from "node:crypto";
import type { RecoveryExecutionRequest } from "./recoveryExecution";

export type RecoveryExecutionAuditStatus = "executed" | "rejected" | "failed";

export type RecoveryExecutionSanitizedFailure = Readonly<{
  status: "failed";
  reasonCode: "INTERNAL_SANITIZED_FAILURE";
}>;

export type RecoveryExecutionAuditEvent = Readonly<{
  eventType: "recovery.execution.finished";
  evidenceVersion: "d011b5-v1";
  evidenceId: string;
  actionId: string;
  componentId: string;
  action: RecoveryExecutionRequest["action"];
  correlationId: string;
  authorizationRef: string;
  leaseId: string;
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

function buildRecoveryExecutionEvidenceId(input: {
  request: RecoveryExecutionRequest;
  startedAt: string;
  finishedAt: string;
  status: RecoveryExecutionAuditStatus;
  reasonCode: string;
}): string {
  const canonicalEvidence = JSON.stringify([
    "d011b5-v1",
    input.request.tenantId,
    input.request.actionId,
    input.request.componentId,
    input.request.action,
    input.request.correlationId,
    input.request.authorizationRef,
    input.request.leaseId,
    input.request.fencingToken,
    input.startedAt,
    input.finishedAt,
    input.status,
    input.reasonCode,
  ]);

  return createHash("sha256").update(canonicalEvidence, "utf8").digest("hex");
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
    evidenceVersion: "d011b5-v1",
    evidenceId: buildRecoveryExecutionEvidenceId(input),
    actionId: input.request.actionId,
    componentId: input.request.componentId,
    action: input.request.action,
    correlationId: input.request.correlationId,
    authorizationRef: input.request.authorizationRef,
    leaseId: input.request.leaseId,
    fencingToken: input.request.fencingToken,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    status: input.status,
    reasonCode: input.reasonCode,
  };
}
