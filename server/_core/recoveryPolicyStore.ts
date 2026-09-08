export type RecoveryComponentState = {
  attemptTimestamps: number[];
  cooldownUntilMs: number | null;
  circuitOpen: boolean;
  healthyStreak: number;
  lastDecisionId: string | null;
  lastTransitionId: string | null;
  inProgress: boolean;
};

export type RecoveryPolicyStore = {
  get(componentId: string): RecoveryComponentState;
  set(componentId: string, state: RecoveryComponentState): void;
};

const emptyState = (): RecoveryComponentState => ({
  attemptTimestamps: [],
  cooldownUntilMs: null,
  circuitOpen: false,
  healthyStreak: 0,
  lastDecisionId: null,
  lastTransitionId: null,
  inProgress: false,
});

export function createInMemoryRecoveryPolicyStore(): RecoveryPolicyStore {
  const states = new Map<string, RecoveryComponentState>();

  return {
    get(componentId) {
      const current = states.get(componentId) ?? emptyState();
      return {
        ...current,
        attemptTimestamps: [...current.attemptTimestamps],
      };
    },
    set(componentId, state) {
      states.set(componentId, {
        ...state,
        attemptTimestamps: [...state.attemptTimestamps],
      });
    },
  };
}
