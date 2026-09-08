import type { RecoveryDecision } from "./recoveryPolicy";

export type RecoveryActionType = "restart_component";

export type DryRunRecoveryResult = {
  decisionId: string;
  componentId: string;
  mode: "dry_run";
  outcome: "simulated" | "skipped" | "rejected";
  actionType: RecoveryActionType;
  startedAt: string;
  completedAt: string;
};

export type DryRunRecoveryExecutor = {
  execute(decision: RecoveryDecision, now?: Date): Promise<DryRunRecoveryResult>;
};

export function createDryRunRecoveryExecutor(): DryRunRecoveryExecutor {
  return {
    async execute(decision, now = new Date()) {
      if (decision.decision !== "allow_dry_run") {
        throw new Error("Recovery decision is not executable in dry-run mode.");
      }

      const timestamp = now.toISOString();
      return {
        decisionId: decision.decisionId,
        componentId: decision.componentId,
        mode: "dry_run",
        outcome: "simulated",
        actionType: "restart_component",
        startedAt: timestamp,
        completedAt: timestamp,
      };
    },
  };
}
