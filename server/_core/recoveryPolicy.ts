import type { HealthCriticality, HealthState } from "./healthRegistry";
import type { RecoveryComponentState, RecoveryPolicyStore } from "./recoveryPolicyStore";

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
  confirmedHealthyCycles?: number;
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
    cooldownUntilMs: number | null = null,
  ): RecoveryDecision => ({
    decisionId: createId(),
    componentId: input.componentId,
    decision,
    reasonCode,
    policyVersion: "d011b1-v1",
    attemptNumber,
    cooldownUntil:
      cooldownUntilMs === null ? null : new Date(cooldownUntilMs).toISOString(),
    createdAt: now.toISOString(),
  });

  const rememberTransition = (
    componentId: string,
    state: RecoveryComponentState,
    transitionId: string,
    healthyStreak = state.healthyStreak,
  ): RecoveryComponentState => {
    const next = { ...state, lastTransitionId: transitionId, healthyStreak };
    store.set(componentId, next);
    return next;
  };

  return {
    evaluate(input, now = new Date()) {
      let state = store.get(input.componentId);
      const initialAttemptNumber = state.attemptTimestamps.length;

      if (!config.enabled) {
        return decide(input, now, "suppress", "POLICY_DISABLED", initialAttemptNumber);
      }
      if (state.lastTransitionId === input.transitionId) {
        return decide(
          input,
          now,
          "suppress",
          "DUPLICATE_TRANSITION",
          initialAttemptNumber,
          state.cooldownUntilMs,
        );
      }
      if (input.from === input.to) {
        rememberTransition(input.componentId, state, input.transitionId, 0);
        return decide(input, now, "suppress", "INVALID_TRANSITION", initialAttemptNumber);
      }
      if (!config.recoverableComponents.has(input.componentId)) {
        rememberTransition(input.componentId, state, input.transitionId, 0);
        return decide(
          input,
          now,
          "suppress",
          "COMPONENT_NOT_ALLOWLISTED",
          initialAttemptNumber,
        );
      }

      if (input.to === "healthy") {
        if (state.circuitOpen) {
          const confirmedHealthyCycles =
            Number.isInteger(input.confirmedHealthyCycles) && input.confirmedHealthyCycles! > 0
              ? input.confirmedHealthyCycles!
              : 1;
          const healthyStreak = state.healthyStreak + confirmedHealthyCycles;
          if (healthyStreak >= config.healthyCyclesToCloseCircuit) {
            state = {
              ...state,
              attemptTimestamps: [],
              cooldownUntilMs: null,
              circuitOpen: false,
              healthyStreak: 0,
              lastTransitionId: input.transitionId,
            };
            store.set(input.componentId, state);
            return decide(input, now, "suppress", "STATE_NOT_RECOVERABLE", 0);
          }
          state = rememberTransition(
            input.componentId,
            state,
            input.transitionId,
            healthyStreak,
          );
        } else {
          state = rememberTransition(input.componentId, state, input.transitionId, 0);
        }
        return decide(
          input,
          now,
          "suppress",
          "STATE_NOT_RECOVERABLE",
          state.attemptTimestamps.length,
          state.cooldownUntilMs,
        );
      }

      if (input.to !== "unhealthy") {
        state = rememberTransition(input.componentId, state, input.transitionId, 0);
        return decide(
          input,
          now,
          "suppress",
          "STATE_NOT_RECOVERABLE",
          state.attemptTimestamps.length,
          state.cooldownUntilMs,
        );
      }

      state = {
        ...state,
        lastTransitionId: input.transitionId,
        healthyStreak: 0,
      };

      const nowMs = now.getTime();
      const windowStart = nowMs - config.attemptWindowMs;
      const attempts = state.attemptTimestamps.filter(timestamp => timestamp >= windowStart);

      if (state.circuitOpen) {
        store.set(input.componentId, state);
        return decide(
          input,
          now,
          "suppress",
          "RECOVERY_CIRCUIT_OPEN",
          attempts.length,
          state.cooldownUntilMs,
        );
      }
      if (state.inProgress) {
        store.set(input.componentId, state);
        return decide(
          input,
          now,
          "suppress",
          "RECOVERY_ALREADY_IN_PROGRESS",
          attempts.length,
          state.cooldownUntilMs,
        );
      }
      if (state.cooldownUntilMs !== null && nowMs < state.cooldownUntilMs) {
        store.set(input.componentId, state);
        return decide(
          input,
          now,
          "suppress",
          "COOLDOWN_ACTIVE",
          attempts.length,
          state.cooldownUntilMs,
        );
      }
      if (attempts.length >= config.maxAttempts) {
        store.set(input.componentId, {
          ...state,
          attemptTimestamps: attempts,
          circuitOpen: true,
        });
        return decide(
          input,
          now,
          "escalate",
          "ATTEMPT_LIMIT_REACHED",
          attempts.length,
          state.cooldownUntilMs,
        );
      }

      const nextAttempts = [...attempts, nowMs];
      const cooldownUntilMs = nowMs + config.cooldownMs;
      store.set(input.componentId, {
        ...state,
        attemptTimestamps: nextAttempts,
        cooldownUntilMs,
      });
      return decide(
        input,
        now,
        "allow_dry_run",
        "UNHEALTHY_ELIGIBLE",
        nextAttempts.length,
        cooldownUntilMs,
      );
    },
  };
}
