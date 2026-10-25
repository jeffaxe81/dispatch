import {
  assertWorkflowSlaDeliveryState,
  transitionWorkflowSlaDelivery,
  type WorkflowSlaDeliveryState,
} from "./workflowSlaDeliveryState";

export type WorkflowSlaNotificationSnapshot = {
  state: WorkflowSlaDeliveryState;
  workflowVersionId: number;
  nodeId: string;
  taskActive: boolean;
};

export type WorkflowSlaNotificationReceipt = {
  organizationId: number;
  intentId: number;
  taskId: number;
  workflowVersionId: number;
  nodeId: string;
  correlationId: string;
  eventKind: WorkflowSlaDeliveryState["eventKind"];
  eventKey: string;
  scheduledAt: string;
  acceptedAt: string;
  deliveryVersion: number;
};

export type WorkflowSlaNotificationInput = {
  intentId: number;
  organizationId: number;
  expectedVersion: number;
  workerId: string;
  leaseToken: string;
  operatorApproved: boolean;
};

export type WorkflowSlaNotificationChange = {
  current: WorkflowSlaDeliveryState;
  next: WorkflowSlaDeliveryState;
  receipt: WorkflowSlaNotificationReceipt | null;
  eventKey: string;
  workerId: string;
  reason: "internal_accepted" | "task_inactive";
};

export type WorkflowSlaNotificationTransaction = {
  loadForUpdate(scope: {
    intentId: number;
    organizationId: number;
  }): Promise<WorkflowSlaNotificationSnapshot | null>;
  findReceipt(scope: {
    intentId: number;
    organizationId: number;
    eventKey: string;
  }): Promise<WorkflowSlaNotificationReceipt | null>;
  commit(change: WorkflowSlaNotificationChange): Promise<void>;
};

export type WorkflowSlaNotificationStore = {
  transaction<T>(
    callback: (tx: WorkflowSlaNotificationTransaction) => Promise<T>
  ): Promise<T>;
};

function assertGate(operatorApproved: boolean) {
  if (
    process.env.AXE_RUNTIME_ENV !== "homologation" ||
    process.env.AXE_SLA_I5D_ENABLED !== "true"
  ) {
    throw new Error("Confirmação interna I5D desabilitada.");
  }
  if (operatorApproved !== true) throw new Error("Sessão I5D não aprovada.");
}

function assertIdentifier(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Identificador SLA inválido.");
}

function assertOpaque(value: string, limit: number) {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.length > limit ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("Identificação de reserva SLA inválida.");
  }
}

function utcMillis(value: string): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error("Relógio SLA deve representar UTC com milissegundos.");
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 0 ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error("Relógio SLA contém calendário UTC inválido.");
  }
  return milliseconds;
}

/** Gate before DB access; approval is a trusted internal precondition, never RBAC. */
export function validateWorkflowSlaNotificationInput(
  input: WorkflowSlaNotificationInput
) {
  assertGate(input.operatorApproved);
  assertIdentifier(input.intentId);
  assertIdentifier(input.organizationId);
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  ) {
    throw new Error("Versão da reserva SLA inválida.");
  }
  assertOpaque(input.workerId, 120);
  assertOpaque(input.leaseToken, 160);
}

export function workflowSlaNotificationEventKey(
  state: WorkflowSlaDeliveryState
): string {
  return `workflow.sla.v1:${state.organizationId}:${state.taskId}:${state.eventKind}`;
}

/** Receipt proves acceptance into this internal inbox only, never a human read or external send. */
export function matchesWorkflowSlaNotificationReceipt(
  receipt: WorkflowSlaNotificationReceipt,
  snapshot: WorkflowSlaNotificationSnapshot
): boolean {
  const state = snapshot.state;
  return (
    receipt.organizationId === state.organizationId &&
    receipt.intentId === state.intentId &&
    receipt.taskId === state.taskId &&
    receipt.workflowVersionId === snapshot.workflowVersionId &&
    receipt.nodeId === snapshot.nodeId &&
    receipt.correlationId === state.correlationId &&
    receipt.eventKind === state.eventKind &&
    receipt.eventKey === workflowSlaNotificationEventKey(state) &&
    receipt.scheduledAt === state.scheduledAt &&
    receipt.deliveryVersion === state.version &&
    receipt.acceptedAt === state.deliveredAt &&
    state.deliveredAt !== null &&
    utcMillis(receipt.acceptedAt) >= utcMillis(state.scheduledAt)
  );
}

const policy = {
  maxAttempts: 3,
  leaseDurationMs: 60_000,
  baseRetryMs: 5_000,
  maxRetryMs: 30_000,
};

/**
 * Manual homologation service. Store MUST hold task, tenant, execution and intent
 * locks through receipt + CAS + audit and roll back all of them on any error.
 * No endpoint, scheduler, external publisher or task reassignment is attached.
 */
export function createWorkflowSlaInternalNotificationService(
  store: WorkflowSlaNotificationStore,
  clock: () => string = () => new Date().toISOString()
) {
  return {
    async confirm(input: WorkflowSlaNotificationInput): Promise<{
      outcome: "delivered" | "duplicate" | "dead_lettered";
      organizationId: number;
      intentId: number;
      eventKey: string;
    }> {
      validateWorkflowSlaNotificationInput(input);
      return store.transaction(async tx => {
        const snapshot = await tx.loadForUpdate(input);
        assertGate(input.operatorApproved);
        if (
          !snapshot ||
          snapshot.state.intentId !== input.intentId ||
          snapshot.state.organizationId !== input.organizationId
        ) {
          throw new Error("Intenção SLA não encontrada no escopo autorizado.");
        }
        const current = snapshot.state;
        assertWorkflowSlaDeliveryState(current);
        assertIdentifier(snapshot.workflowVersionId);
        assertOpaque(snapshot.nodeId, 120);
        if (typeof snapshot.taskActive !== "boolean")
          throw new Error("Estado de tarefa SLA inválido.");
        const eventKey = workflowSlaNotificationEventKey(current);
        const receipt = await tx.findReceipt({ ...input, eventKey });
        // Read wall clock AFTER potentially waiting for database locks/receipt.
        const now = clock();
        const nowMs = utcMillis(now);
        assertGate(input.operatorApproved);
        const result = (
          outcome: "delivered" | "duplicate" | "dead_lettered"
        ) => ({
          outcome,
          organizationId: current.organizationId,
          intentId: current.intentId,
          eventKey,
        });
        if (current.status === "delivered") {
          if (
            !receipt ||
            !matchesWorkflowSlaNotificationReceipt(receipt, snapshot)
          ) {
            throw new Error(
              "Confirmação SLA sem recibo interno correspondente."
            );
          }
          return result("duplicate");
        }
        if (receipt)
          throw new Error("Estado SLA diverge do recibo interno existente.");
        if (nowMs < utcMillis(current.scheduledAt))
          throw new Error("Intenção SLA ainda não venceu.");
        const principal = {
          organizationId: input.organizationId,
          expectedVersion: input.expectedVersion,
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          now,
        };
        const transition = transitionWorkflowSlaDelivery(
          current,
          snapshot.taskActive
            ? { ...principal, type: "delivered" }
            : {
                ...principal,
                type: "failed",
                failureCode: "permanent_rejection",
              },
          policy
        );
        const next = transition.state;
        assertWorkflowSlaDeliveryState(next);
        const accepted: WorkflowSlaNotificationReceipt | null =
          snapshot.taskActive
            ? {
                organizationId: next.organizationId,
                intentId: next.intentId,
                taskId: next.taskId,
                workflowVersionId: snapshot.workflowVersionId,
                nodeId: snapshot.nodeId,
                correlationId: next.correlationId,
                eventKind: next.eventKind,
                eventKey,
                scheduledAt: next.scheduledAt,
                acceptedAt: now,
                deliveryVersion: next.version,
              }
            : null;
        assertGate(input.operatorApproved);
        await tx.commit({
          current,
          next,
          receipt: accepted,
          eventKey,
          workerId: input.workerId,
          reason: snapshot.taskActive ? "internal_accepted" : "task_inactive",
        });
        // Throwing here still rolls back the transaction, including its audit.
        assertGate(input.operatorApproved);
        return result(snapshot.taskActive ? "delivered" : "dead_lettered");
      });
    },
  };
}
