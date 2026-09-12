export interface InventoryReleaseChecks {
  tenantIsolation: boolean;
  negativeAuthorization: boolean;
  restContract: boolean;
  eventContract: boolean;
  auditCorrelation: boolean;
  minimumLoad: boolean;
  dependencyCheck: boolean;
  build: boolean;
  rollbackPlan: boolean;
  operationalManual: boolean;
}

export interface InventoryReleaseReadiness {
  ready: boolean;
  blockers: Array<keyof InventoryReleaseChecks>;
}

const orderedChecks: Array<keyof InventoryReleaseChecks> = [
  "tenantIsolation",
  "negativeAuthorization",
  "restContract",
  "eventContract",
  "auditCorrelation",
  "minimumLoad",
  "dependencyCheck",
  "build",
  "rollbackPlan",
  "operationalManual",
];

/**
 * Pure release gate for the Inventory/Dispatch integration.
 * It does not execute grants, migrations, deploys or external side effects.
 */
export function buildInventoryReleaseReadiness(checks: InventoryReleaseChecks): InventoryReleaseReadiness {
  const blockers = orderedChecks.filter((check) => !checks[check]);
  return { ready: blockers.length === 0, blockers };
}
