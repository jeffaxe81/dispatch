import {
  mapDecisionToRecoveryAction,
  type RecoveryActionKind,
  type RecoveryActionPort,
  type RecoveryActionReasonCode,
  type RecoveryActionRequest,
  type RecoveryActionResult,
} from "./recoveryAction";
import type {
  RecoveryDecision,
  RecoveryReasonCode,
  RecoveryTransitionInput,
} from "./recoveryPolicy";
import type { RecoveryPolicyStore } from "./recoveryPolicyStore";

export type RecoveryAuditEvent = {
  event:
    | "recovery_policy_evaluated"
    | "recovery_suppressed"
    | "recovery_escalated"
    | "recovery_circuit_opened"
    | "recovery_circuit_closed"
    | "recovery_action_started"
    | "recovery_action_completed"
    | "recovery_action_rejected";
  componentId: string;
  decisionId: string;
  reasonCode: RecoveryReasonCode;
  policyVersion: "d011b1-v1";
  attemptNumber: number;
  occurredAt: string;
  actionId?: string;
  action?: RecoveryActionKind;
  actionStatus?: RecoveryActionResult["status"];
  actionReasonCode?: RecoveryActionReasonCode;
  correlationId?: string;
  durationMs?: number;
};

export function createRecoveryOrchestrator(options: {
  engine: { evaluate(input: RecoveryTransitionInput, now?: Date): RecoveryDecision };
  actionPort: RecoveryActionPort;
  store: RecoveryPolicyStore;
  audit?: (event: RecoveryAuditEvent) => void;
}): {
  handle(input: RecoveryTransitionInput, now?: Date): Promise<RecoveryDecision>;
} {
  const { engine, actionPort, store } = options;
  const audit = options.audit ?? (() => undefined);

  const emit = (
    event: RecoveryAuditEvent["event"],
    decision: RecoveryDecision,
    now: Date,
    action?: Partial<RecoveryAuditEvent>,
  ): void => {
    audit({
      event,
      componentId: decision.componentId,
      decisionId: decision.decisionId,
      reasonCode: decision.reasonCode,
      policyVersion: decision.policyVersion,
      attemptNumber: decision.attemptNumber,
      occurredAt: now.toISOString(),
      ...action,
    });
  };

  const inProgressDecision = (
    input: RecoveryTransitionInput,
    now: Date,
  ): RecoveryDecision => {
    const current = store.get(input.componentId);
    return {
      decisionId: current.lastDecisionId ?? `in-progress:${input.transitionId}`,
      componentId: input.componentId,
      decision: "suppress",
      reasonCode: "RECOVERY_ALREADY_IN_PROGRESS",
      policyVersion: "d011b1-v1",
      attemptNumber: current.attemptTimestamps.length,
      cooldownUntil:
        current.cooldownUntilMs === null
          ? null
          : new Date(current.cooldownUntilMs).toISOString(),
      createdAt: now.toISOString(),
    };
  };

  return {
    async handle(input, now = new Date()) {
      const beforeEvaluation = store.get(input.componentId);
      if (beforeEvaluation.inProgress) {
        const suppressed = inProgressDecision(input, now);
        emit("recovery_suppressed", suppressed, now);
        return suppressed;
      }

      const decision = engine.evaluate(input, now);
      const afterEvaluation = store.get(input.componentId);

      emit("recovery_policy_evaluated", decision, now);
      if (!beforeEvaluation.circuitOpen && afterEvaluation.circuitOpen) {
        emit("recovery_circuit_opened", decision, now);
      } else if (beforeEvaluation.circuitOpen && !afterEvaluation.circuitOpen) {
        emit("recovery_circuit_closed", decision, now);
      }

      if (decision.decision === "suppress") {
        emit("recovery_suppressed", decision, now);
        return decision;
      }

      if (decision.decision === "escalate") {
        emit("recovery_escalated", decision, now);
        return decision;
      }

      const current = store.get(input.componentId);
      if (current.inProgress) {
        const suppressed: RecoveryDecision = {
          ...decision,
          decision: "suppress",
          reasonCode: "RECOVERY_ALREADY_IN_PROGRESS",
        };
        emit("recovery_suppressed", suppressed, now);
        return suppressed;
      }

      store.set(input.componentId, { ...current, inProgress: true });
      let actionRequest: RecoveryActionRequest | null = null;
      try {
        try {
          actionRequest = mapDecisionToRecoveryAction({
            decision,
            transition: input,
            now,
          });
        } catch {
          emit("recovery_action_rejected", decision, now, {
            actionReasonCode: "UNKNOWN_COMPONENT",
          });
          return decision;
        }

        emit("recovery_action_started", decision, now, {
          actionId: actionRequest.actionId,
          action: actionRequest.action,
          correlationId: actionRequest.correlationId,
        });

        try {
          const result = await actionPort.execute(actionRequest);
          emit("recovery_action_completed", decision, now, {
            actionId: actionRequest.actionId,
            action: actionRequest.action,
            actionStatus: result.status,
            actionReasonCode: result.reasonCode,
            correlationId: result.correlationId,
            durationMs: result.durationMs,
          });
        } catch {
          emit("recovery_action_rejected", decision, now, {
            actionId: actionRequest.actionId,
            action: actionRequest.action,
            actionReasonCode: "ADAPTER_FAILURE",
            correlationId: actionRequest.correlationId,
          });
        }
      } finally {
        const latest = store.get(input.componentId);
        store.set(input.componentId, { ...latest, inProgress: false });
      }

      return decision;
    },
  };
}
