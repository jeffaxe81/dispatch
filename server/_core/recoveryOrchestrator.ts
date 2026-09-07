import type { DryRunRecoveryExecutor } from "./recoveryDryRunExecutor";
import type {
  RecoveryDecision,
  RecoveryReasonCode,
  RecoveryTransitionInput,
} from "./recoveryPolicy";
import type { RecoveryPolicyStore } from "./recoveryPolicyStore";

export type RecoveryAuditEvent = {
  event:
    | "recovery_policy_evaluated"
    | "recovery_dry_run_started"
    | "recovery_dry_run_completed"
    | "recovery_suppressed"
    | "recovery_escalated"
    | "recovery_circuit_opened"
    | "recovery_circuit_closed";
  componentId: string;
  decisionId: string;
  reasonCode: RecoveryReasonCode;
  policyVersion: "d011b1-v1";
  attemptNumber: number;
  occurredAt: string;
};

export function createRecoveryOrchestrator(options: {
  engine: { evaluate(input: RecoveryTransitionInput, now?: Date): RecoveryDecision };
  executor: DryRunRecoveryExecutor;
  store: RecoveryPolicyStore;
  audit?: (event: RecoveryAuditEvent) => void;
}): {
  handle(input: RecoveryTransitionInput, now?: Date): Promise<RecoveryDecision>;
} {
  const { engine, executor, store } = options;
  const audit = options.audit ?? (() => undefined);

  const emit = (
    event: RecoveryAuditEvent["event"],
    decision: RecoveryDecision,
    now: Date,
  ): void => {
    audit({
      event,
      componentId: decision.componentId,
      decisionId: decision.decisionId,
      reasonCode: decision.reasonCode,
      policyVersion: decision.policyVersion,
      attemptNumber: decision.attemptNumber,
      occurredAt: now.toISOString(),
    });
  };

  return {
    async handle(input, now = new Date()) {
      const before = store.get(input.componentId);
      const decision = engine.evaluate(input, now);
      const afterEvaluation = store.get(input.componentId);

      emit("recovery_policy_evaluated", decision, now);
      if (!before.circuitOpen && afterEvaluation.circuitOpen) {
        emit("recovery_circuit_opened", decision, now);
      } else if (before.circuitOpen && !afterEvaluation.circuitOpen) {
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
      try {
        emit("recovery_dry_run_started", decision, now);
        await executor.execute(decision, now);
        emit("recovery_dry_run_completed", decision, now);
      } catch {
        emit("recovery_suppressed", decision, now);
      } finally {
        const latest = store.get(input.componentId);
        store.set(input.componentId, { ...latest, inProgress: false });
      }

      return decision;
    },
  };
}
