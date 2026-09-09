import type { RecoveryActionKind, RecoveryActionResult } from "./recoveryAction";

export type RecoveryExecutorCapability = "simulation" | "noop";

export type RecoveryExecutionRequest = Readonly<{
  tenantId: string;
  actionId: string;
  transitionId: string;
  componentId: string;
  action: RecoveryActionKind;
  requestedAt: string;
  correlationId: string;
  reservationId: string;
  leaseId: string;
  leaseNamespace: "d011b3-v1";
  ownerId: string;
  fencingToken: number;
  authorizationRef: string;
  deadlineAt: string;
}>;

export type RecoveryExecutorPort = Readonly<{
  capability: RecoveryExecutorCapability;
  execute(
    request: RecoveryExecutionRequest,
    signal?: AbortSignal,
  ): Promise<RecoveryActionResult>;
}>;

export type RecoveryExecutionValidationReason =
  | "EXECUTION_CONTEXT_INVALID"
  | "FENCING_TOKEN_INVALID"
  | "DEADLINE_INVALID"
  | "REAL_EXECUTOR_FORBIDDEN";

export type RecoveryExecutionValidationResult =
  | Readonly<{ valid: true }>
  | Readonly<{ valid: false; reasonCode: RecoveryExecutionValidationReason }>;

const REQUIRED_STRING_FIELDS = [
  "tenantId",
  "actionId",
  "transitionId",
  "componentId",
  "requestedAt",
  "correlationId",
  "reservationId",
  "leaseId",
  "ownerId",
  "authorizationRef",
] as const;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validateRecoveryExecutionRequest(
  value: unknown,
): RecoveryExecutionValidationResult {
  if (typeof value !== "object" || value === null) {
    return { valid: false, reasonCode: "EXECUTION_CONTEXT_INVALID" };
  }

  const request = value as Record<string, unknown>;
  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(request[field])) {
      return { valid: false, reasonCode: "EXECUTION_CONTEXT_INVALID" };
    }
  }

  if (request.action !== "restart_component" || request.leaseNamespace !== "d011b3-v1") {
    return { valid: false, reasonCode: "EXECUTION_CONTEXT_INVALID" };
  }

  if (!Number.isInteger(request.fencingToken) || (request.fencingToken as number) <= 0) {
    return { valid: false, reasonCode: "FENCING_TOKEN_INVALID" };
  }

  if (!isNonEmptyString(request.deadlineAt) || !Number.isFinite(Date.parse(request.deadlineAt))) {
    return { valid: false, reasonCode: "DEADLINE_INVALID" };
  }

  return { valid: true };
}

export function validateRecoveryExecutorCapability(
  capability: unknown,
): RecoveryExecutionValidationResult {
  return capability === "simulation" || capability === "noop"
    ? { valid: true }
    : { valid: false, reasonCode: "REAL_EXECUTOR_FORBIDDEN" };
}
