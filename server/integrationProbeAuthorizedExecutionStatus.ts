import type {
  AuthorizedProbeExecutionWithReceipt,
} from "./integrationProbeAuthorizedExecutionReceipt";

export type AuthorizedProbeOperationalStatus = Readonly<{
  executionId: string;
  organizationId: number;
  system: string;
  state: string;
  version: number | null;
  executedAtMs: number;
  durationMs: number;
  healthy: boolean;
  severity: "ok" | "attention";
  message: string;
}>;

function isHealthyState(state: string): boolean {
  return state === "closed";
}

/**
 * J44 projects the J43 receipt into a compact operational view that can be
 * consumed by dashboards and admin surfaces without exposing internal tokens.
 */
export function projectAuthorizedProbeOperationalStatus(
  execution: AuthorizedProbeExecutionWithReceipt,
): AuthorizedProbeOperationalStatus {
  const { receipt } = execution;
  const healthy = isHealthyState(receipt.state);

  return Object.freeze({
    executionId: receipt.executionId,
    organizationId: receipt.organizationId,
    system: receipt.system,
    state: receipt.state,
    version: receipt.version,
    executedAtMs: receipt.executedAtMs,
    durationMs: receipt.durationMs,
    healthy,
    severity: healthy ? "ok" as const : "attention" as const,
    message: healthy
      ? "Probe autorizado concluído sem indicação de degradação."
      : "Probe autorizado concluído com estado que exige atenção operacional.",
  });
}
