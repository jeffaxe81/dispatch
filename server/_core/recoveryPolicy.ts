import type { HealthCriticality, HealthState } from "./healthRegistry";
import type { RecoveryPolicyStore } from "./recoveryPolicyStore";

export type RecoveryReasonCode =
  | "UNHEALTHY_ELIGIBLE"
  | "COMPONENT_NOT_ALLOWLISTED"
  | "STATE_NOT_RECOVERABLE"
  | "COOLDOWN_ACTIVE"
  | "ATTEMPT_LIMIT_REACHED"
  | "RECOVERY_CIRCUIT_OPEN"
  | "DUPLICATE_TRANSITION"
  | "RECOVERY_ALREADY_IN_PROGRESS"
  | "POLICY_DISABLED"
  | "INVALID_TRANSITION";

export type RecoveryDecisionKind = "allow_dry_run" | "suppress" | "escalate";

export type RecoveryTransitionInput = {
  transitionId: string;
  componentId: string;
  from: HealthState;
  to: HealthState;
  criticality: HealthCriticality;
  occurredAt: string;
};

export type RecoveryDecision = {
  decisionId: string;
  componentId: string;
  decision: RecoveryDecisionKind;
  reasonCode: RecoveryReasonCode;
  policyVersion: "d011b1-v1";
  attemptNumber: number;
  cooldownUntil: string | null;
  createdAt: string;
};

export type RecoveryPolicyConfig = {
  enabled: boolean;
  recoverableComponents: ReadonlySet<string>;
  cooldownMs: number;
  attemptWindowMs: number;
  maxAttempts: number;
  healthyCyclesToCloseCircuit: number;
};

function assertConfig(config: RecoveryPolicyConfig): void {
  if (!Number.isFinite(config.cooldownMs) || config.cooldownMs <= 0) {
    throw new Error("cooldownMs must be positive");
  }
  if (!Number.isFinite(config.attemptWindowMs) || config.attemptWindowMs <= 0) {
    throw new Error("attemptWindowMs must be positive");
  }
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts <= 0) {
    throw new Error("maxAttempts must be a positive integer");
  }
  if (
    !Number.isInteger(config.healthyCyclesToCloseCircuit) ||
    config.healthyCyclesToCloseCircuit <= 0
  ) {
    throw new Error("healthyCyclesToCloseCircuit must be a positive integer");
  }
}

export function createRecoveryPolicyEngine(options: {
  store: RecoveryPolicyStore;
  config: RecoveryPolicyConfig;
  createId?: () => string;
}): {
  evaluate(input: RecoveryTransitionInput, now?: Date): RecoveryDecision;
} {
  const { store, config } = options;
  const createId = options.createId ?? (() => crypto.randomUUID());
  assertConfig(config);

  const decide = (
    input: RecoveryTransitionInput,
    now: Date,
    decision: RecoveryDecisionKind,
    reasonCode: RecoveryReasonCode,
    attemptNumber: number,
  ): RecoveryDecision => ({
    decisionId: createId(),
    componentId: input.componentId,
    decision,
    reasonCode,
    policyVersion: "d011b1-v1",
    attemptNumber,
    cooldownUntil: null,
    createdAt: now.toISOString(),
  });

  return {
    evaluate(input, now = new Date()) {
      const state = store.get(input.componentId);
      const attemptNumber = state.attemptTimestamps.length;

      if (!config.enabled) {
        return decide(input, now, "suppress", "POLICY_DISABLED", attemptNumber);
      }
      if (input.from === input.to) {
        return decide(input, now, "suppress", "INVALID_TRANSITION", attemptNumber);
      }
      if (!config.recoverableComponents.has(input.componentId)) {
        return decide(
          input,
          now,
          "suppress",
          "COMPONENT_NOT_ALLOWLISTED",
          attemptNumber,
        );
      }
      if (input.to !== "unhealthy") {
        return decide(input, now, "suppress", "STATE_NOT_RECOVERABLE", attemptNumber);
      }

      return decide(input, now, "allow_dry_run", "UNHEALTHY_ELIGIBLE", attemptNumber + 1);
    },
  };
}
