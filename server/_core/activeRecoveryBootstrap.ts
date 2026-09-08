import type { ActiveRecoveryConfig } from "./activeRecoveryAuthorization";
import type { RecoveryActionPort } from "./recoveryAction";
import type {
  RecoveryActionRecordPort,
  RecoveryExecutionLedgerPort,
} from "./recoveryActionRecord";
import {
  createRecoveryExecutionBoundary,
  type RecoveryExecutionSafetyGuardPort,
} from "./recoveryExecutionBoundary";
import { createRecoveryExecutionSafetyGuard } from "./recoveryExecutionSafetyGuard";
import type { RecoveryExecutorPort } from "./recoveryExecution";
import type { RecoveryExecutionAuditPort } from "./recoveryExecutionAudit";
import type { RecoveryLeasePort } from "./recoveryLease";
import {
  createSimulatedRecoveryAdapter,
  type SimulationClock,
} from "./simulatedRecoveryAdapter";

export type ActiveRecoveryExecutionPorts = Readonly<{
  leasePort: RecoveryLeasePort;
  recordPort: RecoveryActionRecordPort;
  ledger: RecoveryExecutionLedgerPort;
  audit: RecoveryExecutionAuditPort;
}>;

export type ActiveRecoveryBootstrap = Readonly<{
  config: ActiveRecoveryConfig;
  actionPort: RecoveryActionPort;
  executionBoundary?: ReturnType<typeof createRecoveryExecutionBoundary>;
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
  execution?: ActiveRecoveryExecutionPorts;
} = {}): ActiveRecoveryBootstrap {
  const config = options.config ?? DEFAULT_ACTIVE_RECOVERY_CONFIG;
  const actionPort = createSimulatedRecoveryAdapter({
    scenario: "success",
    clock: simulationClock,
    timeoutMs: 1_000,
  });

  if (!options.execution) {
    return { config, actionPort };
  }

  const executor: RecoveryExecutorPort = {
    capability: "simulation",
    execute: request => actionPort.execute(request),
  };
  const guard: RecoveryExecutionSafetyGuardPort = createRecoveryExecutionSafetyGuard({
    activeConfig: config,
    leasePort: options.execution.leasePort,
    recordPort: options.execution.recordPort,
  });
  const executionBoundary = createRecoveryExecutionBoundary({
    guard,
    ledger: options.execution.ledger,
    leasePort: options.execution.leasePort,
    executor,
    audit: options.execution.audit,
  });

  return { config, actionPort, executionBoundary };
}
