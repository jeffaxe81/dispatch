import type { ActiveRecoveryConfig } from "./activeRecoveryAuthorization";
import type { RecoveryActionPort } from "./recoveryAction";
import {
  createSimulatedRecoveryAdapter,
  type SimulationClock,
} from "./simulatedRecoveryAdapter";

export type ActiveRecoveryBootstrap = Readonly<{
  config: ActiveRecoveryConfig;
  actionPort: RecoveryActionPort;
}>;

const DEFAULT_ACTIVE_RECOVERY_CONFIG: ActiveRecoveryConfig = {
  enabled: false,
  environment: "homologation-controlled",
  authorizedEnvironment: "homologation-controlled",
  authorizedComponent: "database",
  authorizedAction: "restart_component",
  leaseNamespace: "d011b3-v1",
};

const simulationClock: SimulationClock = {
  now: () => new Date(),
  sleep: async () => undefined,
};

export function createActiveRecoveryBootstrap(options: {
  config?: ActiveRecoveryConfig | null;
} = {}): ActiveRecoveryBootstrap {
  const config = options.config ?? DEFAULT_ACTIVE_RECOVERY_CONFIG;
  const actionPort = createSimulatedRecoveryAdapter({
    scenario: "success",
    clock: simulationClock,
    timeoutMs: 1_000,
  });

  return { config, actionPort };
}
