import type { HealthSnapshot } from "./healthRegistry";
import {
  verifyRecoveryExecutionAuditEvidence,
  type RecoveryExecutionAuditEvent,
} from "./recoveryExecutionAudit";

export type RecoveryPostActionVerificationReasonCode =
  | "EVIDENCE_MISMATCH"
  | "EXECUTION_NOT_SUCCESSFUL"
  | "HEALTH_EVIDENCE_NOT_POST_ACTION"
  | "HEALTH_COMPONENT_MISSING"
  | "HEALTH_NOT_HEALTHY";

export type RecoveryPostActionVerificationResult =
  | Readonly<{ verified: true }>
  | Readonly<{
      verified: false;
      reasonCode: RecoveryPostActionVerificationReasonCode;
    }>;

export function verifyRecoveryPostActionHealth(input: {
  tenantId: string;
  event: RecoveryExecutionAuditEvent;
  health: HealthSnapshot;
}): RecoveryPostActionVerificationResult {
  const evidence = verifyRecoveryExecutionAuditEvidence({
    tenantId: input.tenantId,
    event: input.event,
  });
  if (!evidence.valid) {
    return { verified: false, reasonCode: "EVIDENCE_MISMATCH" };
  }

  if (input.event.status !== "executed" || input.event.reasonCode !== "SIMULATED_SUCCESS") {
    return { verified: false, reasonCode: "EXECUTION_NOT_SUCCESSFUL" };
  }

  const finishedAtMs = Date.parse(input.event.finishedAt);
  const healthCheckedAtMs = Date.parse(input.health.checkedAt);
  if (
    !Number.isFinite(finishedAtMs)
    || !Number.isFinite(healthCheckedAtMs)
    || healthCheckedAtMs < finishedAtMs
  ) {
    return { verified: false, reasonCode: "HEALTH_EVIDENCE_NOT_POST_ACTION" };
  }

  const component = input.health.components.find(
    candidate => candidate.id === input.event.componentId,
  );
  if (!component) {
    return { verified: false, reasonCode: "HEALTH_COMPONENT_MISSING" };
  }

  const componentCheckedAtMs = component.checkedAt === null
    ? Number.NaN
    : Date.parse(component.checkedAt);
  if (!Number.isFinite(componentCheckedAtMs) || componentCheckedAtMs < finishedAtMs) {
    return { verified: false, reasonCode: "HEALTH_EVIDENCE_NOT_POST_ACTION" };
  }

  if (component.state !== "healthy") {
    return { verified: false, reasonCode: "HEALTH_NOT_HEALTHY" };
  }

  return { verified: true };
}
