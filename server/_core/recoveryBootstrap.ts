import type { HealthCriticality } from "./healthRegistry";
import type { HealthTransition } from "./healthWatchdog";
import { createDryRunRecoveryExecutor } from "./recoveryDryRunExecutor";
import { createRecoveryOrchestrator, type RecoveryAuditEvent } from "./recoveryOrchestrator";
import {
  createRecoveryPolicyEngine,
  type RecoveryPolicyConfig,
  type RecoveryTransitionInput,
} from "./recoveryPolicy";
import { createInMemoryRecoveryPolicyStore } from "./recoveryPolicyStore";

export const D011B1_POLICY: RecoveryPolicyConfig = {
  enabled: true,
  recoverableComponents: new Set(["database", "storage"]),
  cooldownMs: 30_000,
  attemptWindowMs: 15 * 60_000,
  maxAttempts: 3,
  healthyCyclesToCloseCircuit: 2,
};

const RECOVERY_COMPONENT_CRITICALITY: Readonly<Record<string, HealthCriticality>> = {
  database: "critical",
  storage: "critical",
};

export function mapHealthTransitionToRecoveryInput(
  transition: HealthTransition,
  confirmedHealthyCycles?: number,
): RecoveryTransitionInput {
  return {
    transitionId: `${transition.componentId}:${transition.from}:${transition.to}:${transition.occurredAt}`,
    componentId: transition.componentId,
    from: transition.from,
    to: transition.to,
    criticality: RECOVERY_COMPONENT_CRITICALITY[transition.componentId] ?? "optional",
    occurredAt: transition.occurredAt,
    ...(transition.to === "healthy" && confirmedHealthyCycles !== undefined
      ? { confirmedHealthyCycles }
      : {}),
  };
}

export function createD011b1RecoveryRuntime(options: {
  audit?: (event: RecoveryAuditEvent) => void;
} = {}) {
  const store = createInMemoryRecoveryPolicyStore();
  const engine = createRecoveryPolicyEngine({ store, config: D011B1_POLICY });
  const executor = createDryRunRecoveryExecutor();
  const orchestrator = createRecoveryOrchestrator({
    store,
    engine,
    executor,
    audit: options.audit,
  });

  return { store, engine, executor, orchestrator };
}
