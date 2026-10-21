import {
  assertWorkflowSlaDeliveryState,
  type WorkflowSlaDeliveryState,
} from "./workflowSlaDeliveryState";

export type WorkflowSlaAdminReplaySnapshot = {
  state: WorkflowSlaDeliveryState;
  taskActive: boolean;
};

export type WorkflowSlaAdminReplayChange = {
  current: WorkflowSlaDeliveryState;
  next: WorkflowSlaDeliveryState;
  actorUserId: number;
  reason: string;
  replayedAt: string;
};

export type WorkflowSlaAdminReplayTransaction = {
  loadForUpdate(scope: {
    intentId: number;
    organizationId: number;
  }): Promise<WorkflowSlaAdminReplaySnapshot | null>;
  commitReplay(change: WorkflowSlaAdminReplayChange): Promise<void>;
};

export type WorkflowSlaAdminReplayStore = {
  transaction<T>(
    callback: (tx: WorkflowSlaAdminReplayTransaction) => Promise<T>,
  ): Promise<T>;
};

export type WorkflowSlaAdminReplayInput = {
  intentId: number;
  organizationId: number;
  actorUserId: number;
  reason: string;
  administratorApproved: boolean;
  now: string;
};

function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} inválido.`);
  }
}

function utcInstant(value: string): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error("now deve ser UTC ISO-8601 válido com milissegundos.");
  }
  const timestamp = Date.parse(value);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    new Date(timestamp).toISOString() !== value
  ) {
    throw new Error("now contém calendário UTC inválido.");
  }
  return timestamp;
}

export function validateWorkflowSlaAdminReplayInput(
  input: WorkflowSlaAdminReplayInput,
) {
  if (input.administratorApproved !== true) {
    throw new Error("Replay SLA exige aprovação administrativa.");
  }
  positiveId(input.intentId, "intentId");
  positiveId(input.organizationId, "organizationId");
  positiveId(input.actorUserId, "ator");
  if (
    typeof input.reason !== "string" ||
    input.reason.trim() !== input.reason ||
    input.reason.length < 3 ||
    input.reason.length > 1000
  ) {
    throw new Error("Justificativa de replay SLA inválida.");
  }
  utcInstant(input.now);
}

export function createWorkflowSlaAdminReplayService(
  store: WorkflowSlaAdminReplayStore,
) {
  return {
    async replay(input: WorkflowSlaAdminReplayInput): Promise<{
      intentId: number;
      organizationId: number;
      status: "pending";
      version: number;
    }> {
      validateWorkflowSlaAdminReplayInput(input);
      return store.transaction(async tx => {
        const snapshot = await tx.loadForUpdate({
          intentId: input.intentId,
          organizationId: input.organizationId,
        });
        if (
          !snapshot ||
          snapshot.state.intentId !== input.intentId ||
          snapshot.state.organizationId !== input.organizationId
        ) {
          throw new Error("Intenção SLA não encontrada no escopo autorizado.");
        }
        assertWorkflowSlaDeliveryState(snapshot.state);
        if (snapshot.state.status !== "dead_letter") {
          throw new Error("Somente intenção SLA em dead_letter/quarentena pode ser reprocessada.");
        }
        if (snapshot.taskActive !== true) {
          throw new Error("Replay SLA exige tarefa ainda ativa.");
        }
        const current = snapshot.state;
        const next: WorkflowSlaDeliveryState = {
          ...current,
          status: "pending",
          version: current.version + 1,
          attempts: 0,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          deliveredAt: null,
          deadLetteredAt: null,
        };
        assertWorkflowSlaDeliveryState(next);
        await tx.commitReplay({
          current,
          next,
          actorUserId: input.actorUserId,
          reason: input.reason,
          replayedAt: input.now,
        });
        return {
          intentId: next.intentId,
          organizationId: next.organizationId,
          status: "pending" as const,
          version: next.version,
        };
      });
    },
  };
}
