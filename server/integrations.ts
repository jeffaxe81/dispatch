export type SimulatedIntegrationsOverview = {
  mode: "simulation";
  externalRequestsEnabled: false;
  credentialsPersistenceEnabled: false;
  metrics: {
    activeWorkflows: number;
    registeredConnections: number;
    executionsLast24Hours: number;
    successRate: number | null;
    errorsLast24Hours: number;
    averageDurationMs: number | null;
  };
  recentExecutions: Array<{ id: number; workflowName: string; status: string; createdAt: Date }>;
  failingConnections: Array<{ id: number; name: string; lastErrorAt: Date | null }>;
};

export function getSimulatedIntegrationsOverview(metrics: SimulatedIntegrationsOverview["metrics"] = {
  activeWorkflows: 0,
  registeredConnections: 0,
  executionsLast24Hours: 0,
  successRate: null,
  errorsLast24Hours: 0,
  averageDurationMs: null,
}): SimulatedIntegrationsOverview {
  return {
    mode: "simulation",
    externalRequestsEnabled: false,
    credentialsPersistenceEnabled: false,
    metrics,
    recentExecutions: [],
    failingConnections: [],
  };
}
