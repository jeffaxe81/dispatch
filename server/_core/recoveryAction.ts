import type { RecoveryDecision, RecoveryTransitionInput } from "./recoveryPolicy";

export type RecoveryActionKind = "restart_component";

export type RecoveryActionReasonCode =
  | "SIMULATED_SUCCESS"
  | "SIMULATED_FAILURE"
  | "SIMULATED_TIMEOUT"
  | "SIMULATED_CANCELLED"
  | "UNKNOWN_COMPONENT"
  | "UNKNOWN_ACTION"
  | "DUPLICATE_ACTION_CONFLICT"
  | "ADAPTER_FAILURE";

export type RecoveryActionRequest = Readonly<{
  actionId: string;
  transitionId: string;
  componentId: string;
  action: RecoveryActionKind;
  requestedAt: string;
  correlationId: string;
}>;

export type RecoveryActionResult = Readonly<{
  actionId: string;
  componentId: string;
  status:
    | "simulated_success"
    | "simulated_failure"
    | "simulated_timeout"
    | "simulated_cancelled";
  reasonCode: RecoveryActionReasonCode;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  correlationId: string;
}>;

export type RecoveryActionPort = {
  execute(request: RecoveryActionRequest, signal?: AbortSignal): Promise<RecoveryActionResult>;
};

const ACTIONABLE_COMPONENTS = new Set(["database", "storage"] as const);

export function mapDecisionToRecoveryAction(input: {
  decision: RecoveryDecision;
  transition: RecoveryTransitionInput;
  now?: Date;
}): RecoveryActionRequest {
  const { decision, transition } = input;
  const now = input.now ?? new Date();

  if (decision.decision !== "allow_dry_run") {
    throw new Error("RECOVERY_ACTION_NOT_ALLOWED");
  }

  if (decision.componentId !== transition.componentId) {
    throw new Error("COMPONENT_MISMATCH");
  }

  if (!ACTIONABLE_COMPONENTS.has(decision.componentId as "database" | "storage")) {
    throw new Error("UNKNOWN_COMPONENT");
  }

  return {
    actionId: `action:${decision.decisionId}`,
    transitionId: transition.transitionId,
    componentId: decision.componentId,
    action: "restart_component",
    requestedAt: now.toISOString(),
    correlationId: decision.decisionId,
  };
}
