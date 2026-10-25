import {
  transitionWorkflowSlaDelivery,
  type WorkflowSlaDeliveryAction,
  type WorkflowSlaDeliveryPolicy,
  type WorkflowSlaDeliveryState,
  type WorkflowSlaDeliveryTransition,
} from "./workflowSlaDeliveryState";

/**
 * I5A: storage boundary for optimistic fencing.
 *
 * A production adapter MUST implement compareAndSwap in one atomic statement
 * or transaction, scoped by intentId + organizationId + expected version, and
 * return true only if exactly one row was updated. Never use read-then-write.
 */
export type WorkflowSlaDeliveryStorage = {
  loadByTenant(input: {
    intentId: number;
    organizationId: number;
  }): Promise<WorkflowSlaDeliveryState | null>;
  compareAndSwap(input: {
    intentId: number;
    organizationId: number;
    expectedVersion: number;
    next: WorkflowSlaDeliveryState;
  }): Promise<boolean>;
};

export class WorkflowSlaDeliveryConflictError extends Error {
  constructor() {
    super("Intenção SLA modificada por outra transação; recarregue o estado.");
    this.name = "WorkflowSlaDeliveryConflictError";
  }
}

export function createWorkflowSlaDeliveryCoordinator(
  storage: WorkflowSlaDeliveryStorage,
  policy: WorkflowSlaDeliveryPolicy,
) {
  return {
    async transition(input: {
      intentId: number;
      action: WorkflowSlaDeliveryAction;
    }): Promise<WorkflowSlaDeliveryTransition> {
      if (!Number.isSafeInteger(input.intentId) || input.intentId < 1
        || !Number.isSafeInteger(input.action.organizationId)
        || input.action.organizationId < 1) {
        throw new Error("Identificadores inválidos.");
      }

      const current = await storage.loadByTenant({
        intentId: input.intentId,
        organizationId: input.action.organizationId,
      });
      // Do not disclose whether the intent exists in another tenant.
      if (!current || current.intentId !== input.intentId
        || current.organizationId !== input.action.organizationId) {
        throw new Error("Intenção SLA não encontrada no escopo autorizado.");
      }

      const result = transitionWorkflowSlaDelivery(current, input.action, policy);
      if (result.state === current) {
        // Non-mutating outcomes are advisory only: never treat as a committed
        // claim, a delivery receipt or evidence that the lease is still held.
        return result;
      }

      if (result.state.version !== current.version + 1
        || result.state.intentId !== current.intentId
        || result.state.organizationId !== current.organizationId
        || result.state.taskId !== current.taskId
        || result.state.eventKind !== current.eventKind
        || result.state.scheduledAt !== current.scheduledAt
        || result.state.correlationId !== current.correlationId) {
        throw new Error("Transição SLA alterou metadados congelados.");
      }

      const swapped = await storage.compareAndSwap({
        intentId: current.intentId,
        organizationId: current.organizationId,
        expectedVersion: current.version,
        next: result.state,
      });
      if (!swapped) throw new WorkflowSlaDeliveryConflictError();
      return result;
    },
  };
}
