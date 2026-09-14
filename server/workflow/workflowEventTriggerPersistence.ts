import type { WorkflowEventEnvelope } from "../../shared/workflowIntegration/v1";
import {
  createWorkflowEventTriggerService,
  type WorkflowEventTriggerDependencies,
  type WorkflowEventTriggerResult,
} from "./workflowEventTriggerService";

type WorkflowEventDefinition = {
  nodes?: Array<{
    id?: unknown;
    type?: unknown;
    configuration?: unknown;
  }>;
  edges?: Array<{
    source?: unknown;
    target?: unknown;
  }>;
};

type WorkflowEventTriggerPersistenceAdapter<TTransaction> = {
  transaction<TResult>(callback: (transaction: TTransaction) => Promise<TResult>): Promise<TResult>;
  buildDependencies(
    transaction: TTransaction,
    organizationId: number,
  ): WorkflowEventTriggerDependencies;
};

export function parseWorkflowEventTenantOrganizationId(tenantId: string): number {
  if (!/^[1-9]\d*$/.test(tenantId)) {
    throw new Error("tenantId de evento deve ser um identificador canônico positivo de organização.");
  }
  const organizationId = Number(tenantId);
  if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
    throw new Error("tenantId de evento está fora do intervalo suportado.");
  }
  return organizationId;
}

export function findWorkflowEventTriggerNodeIds(
  definitionValue: unknown,
  eventType: WorkflowEventEnvelope["eventType"],
): string[] {
  if (!definitionValue || typeof definitionValue !== "object") return [];
  const definition = definitionValue as WorkflowEventDefinition;
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition.edges) ? definition.edges : [];
  const incomingTargets = new Set(
    edges.flatMap(edge => typeof edge?.target === "string" ? [edge.target] : []),
  );

  return nodes.flatMap(node => {
    if (!node || node.type !== "trigger.external_data" || typeof node.id !== "string" || !node.id.trim()) {
      return [];
    }
    if (incomingTargets.has(node.id)) return [];
    const configuration = node.configuration && typeof node.configuration === "object"
      ? node.configuration as Record<string, unknown>
      : {};
    return configuration.eventType === eventType ? [node.id] : [];
  });
}

export function createWorkflowEventTriggerPersistence<TTransaction>(
  adapter: WorkflowEventTriggerPersistenceAdapter<TTransaction>,
) {
  return {
    async consume(
      input: WorkflowEventEnvelope,
      actorUserId: number,
    ): Promise<WorkflowEventTriggerResult> {
      const organizationId = parseWorkflowEventTenantOrganizationId(input.tenantId);
      return adapter.transaction(async transaction => {
        const service = createWorkflowEventTriggerService(
          adapter.buildDependencies(transaction, organizationId),
        );
        return service.consume(input, actorUserId);
      });
    },
  };
}

export async function consumeWorkflowEventPersisted(
  _input: WorkflowEventEnvelope,
  _actorUserId: number,
): Promise<WorkflowEventTriggerResult> {
  throw new Error("Consumer persistente D-012F ainda não está conectado ao runtime de workflow.");
}
