import { and, eq } from "drizzle-orm";
import { workflowExecutions, workflowVersions, workflows } from "../../drizzle/schema";
import type { WorkflowEventEnvelope } from "../../shared/workflowIntegration/v1";
import { getDb } from "../dbLegacy";
import {
  claimWorkflowEventReceipt,
  completeWorkflowEventReceipt,
} from "./workflowEventReceiptStore";
import {
  resumeEventWorkflowInstanceInTransaction,
  startEventWorkflowInstanceInTransaction,
} from "./workflowInstancePersistence";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import {
  workflowExecutionTenantScopes,
  workflowTenantScopes,
} from "./workflowTenantScopeSchema";
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

type WorkflowEventTriggerTransactionOutcome =
  | { ok: true; result: WorkflowEventTriggerResult }
  | { ok: false; error: unknown };

type WorkflowDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type WorkflowEventTx = Parameters<Parameters<WorkflowDb["transaction"]>[0]>[0];

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

export function findWorkflowEventWaitTargetNodeId(
  definitionValue: unknown,
  currentNodeId: string,
  eventType: string,
): string | null {
  if (!definitionValue || typeof definitionValue !== "object") return null;
  const definition = definitionValue as WorkflowEventDefinition;
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition.edges) ? definition.edges : [];
  const currentNode = nodes.find(node =>
    node && typeof node.id === "string" && node.id === currentNodeId
  );
  if (!currentNode || currentNode.type !== "wait.event") return null;
  const configuration = currentNode.configuration && typeof currentNode.configuration === "object"
    ? currentNode.configuration as Record<string, unknown>
    : {};
  if (configuration.eventType !== eventType) return null;

  const outgoing = edges.filter(edge => edge && edge.source === currentNodeId);
  if (outgoing.length !== 1) {
    throw new Error("Nó wait.event deve possuir exatamente uma saída; definição ambígua.");
  }
  const target = outgoing[0]?.target;
  if (typeof target !== "string" || !target.trim()) {
    throw new Error("Nó wait.event possui saída inválida.");
  }
  const targetExists = nodes.some(node => node && node.id === target);
  if (!targetExists) {
    throw new Error("Nó wait.event aponta para destino inexistente.");
  }
  return target;
}

export async function findWorkflowEventStartCandidatesInTransaction(
  tx: WorkflowEventTx,
  organizationId: number,
  eventType: WorkflowEventEnvelope["eventType"],
): Promise<WorkflowEventTriggerDependencies["findStartCandidates"] extends (...args: never[]) => Promise<infer TResult> ? TResult : never> {
  const scopes = await tx
    .select({ workflowId: workflowTenantScopes.workflowId })
    .from(workflowTenantScopes)
    .where(eq(workflowTenantScopes.organizationId, organizationId))
    .limit(1000);

  const candidates: Array<{
    workflowId: number;
    workflowVersionId: number;
    tenantId: string;
    triggerNodeId: string;
  }> = [];

  for (const scope of scopes) {
    const workflow = (
      await tx.select().from(workflows).where(eq(workflows.id, scope.workflowId)).limit(1)
    )[0];
    if (!workflow?.active || !workflow.simulationOnly) continue;

    const pointer = (
      await tx
        .select()
        .from(workflowPublicationPointers)
        .where(eq(workflowPublicationPointers.id, scope.workflowId))
        .limit(1)
    )[0];
    if (!pointer?.publishedVersion || pointer.publishedVersion < 1) continue;

    const version = (
      await tx
        .select()
        .from(workflowVersions)
        .where(and(
          eq(workflowVersions.workflowId, scope.workflowId),
          eq(workflowVersions.version, pointer.publishedVersion),
        ))
        .limit(1)
    )[0];
    if (!version) continue;

    const triggerNodeIds = findWorkflowEventTriggerNodeIds(version.definition, eventType);
    for (const triggerNodeId of triggerNodeIds) {
      candidates.push({
        workflowId: scope.workflowId,
        workflowVersionId: version.id,
        tenantId: String(organizationId),
        triggerNodeId,
      });
    }
  }

  return candidates;
}

export async function findWorkflowEventWaitingCandidatesInTransaction(
  tx: WorkflowEventTx,
  organizationId: number,
  eventType: WorkflowEventEnvelope["eventType"],
): Promise<WorkflowEventTriggerDependencies["findWaitingCandidates"] extends (...args: never[]) => Promise<infer TResult> ? TResult : never> {
  const scopes = await tx
    .select({ executionId: workflowExecutionTenantScopes.executionId })
    .from(workflowExecutionTenantScopes)
    .where(eq(workflowExecutionTenantScopes.organizationId, organizationId))
    .limit(1000);

  const candidates: Array<{
    executionId: number;
    workflowId: number;
    workflowVersionId: number;
    tenantId: string;
    currentNodeId: string;
    targetNodeId: string;
  }> = [];

  for (const scope of scopes) {
    const execution = (
      await tx.select().from(workflowExecutions).where(eq(workflowExecutions.id, scope.executionId)).limit(1)
    )[0];
    if (!execution || execution.mode !== "simulacao" || execution.status !== "pendente" || !execution.workflowVersionId) {
      continue;
    }

    const projection = (
      await tx
        .select({ currentNodeId: workflowInstanceExecutions.currentNodeId })
        .from(workflowInstanceExecutions)
        .where(eq(workflowInstanceExecutions.id, scope.executionId))
        .limit(1)
    )[0];
    if (!projection?.currentNodeId) continue;

    const version = (
      await tx
        .select()
        .from(workflowVersions)
        .where(and(
          eq(workflowVersions.id, execution.workflowVersionId),
          eq(workflowVersions.workflowId, execution.workflowId),
        ))
        .limit(1)
    )[0];
    if (!version) continue;

    const targetNodeId = findWorkflowEventWaitTargetNodeId(
      version.definition,
      projection.currentNodeId,
      eventType,
    );
    if (!targetNodeId) continue;

    candidates.push({
      executionId: execution.id,
      workflowId: execution.workflowId,
      workflowVersionId: execution.workflowVersionId,
      tenantId: String(organizationId),
      currentNodeId: projection.currentNodeId,
      targetNodeId,
    });
  }

  return candidates;
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
      const outcome = await adapter.transaction<WorkflowEventTriggerTransactionOutcome>(async transaction => {
        const service = createWorkflowEventTriggerService(
          adapter.buildDependencies(transaction, organizationId),
        );
        try {
          return { ok: true, result: await service.consume(input, actorUserId) };
        } catch (error) {
          return { ok: false, error };
        }
      });

      if (!outcome.ok) throw outcome.error;
      return outcome.result;
    },
  };
}

type WorkflowEventTriggerDatabaseOperations = {
  claimReceipt: typeof claimWorkflowEventReceipt;
  findStartCandidates: typeof findWorkflowEventStartCandidatesInTransaction;
  findWaitingCandidates: typeof findWorkflowEventWaitingCandidatesInTransaction;
  startInstance: typeof startEventWorkflowInstanceInTransaction;
  resumeInstance: typeof resumeEventWorkflowInstanceInTransaction;
  completeReceipt: typeof completeWorkflowEventReceipt;
};

const defaultWorkflowEventTriggerDatabaseOperations: WorkflowEventTriggerDatabaseOperations = {
  claimReceipt: claimWorkflowEventReceipt,
  findStartCandidates: findWorkflowEventStartCandidatesInTransaction,
  findWaitingCandidates: findWorkflowEventWaitingCandidatesInTransaction,
  startInstance: startEventWorkflowInstanceInTransaction,
  resumeInstance: resumeEventWorkflowInstanceInTransaction,
  completeReceipt: completeWorkflowEventReceipt,
};

export function createWorkflowEventTriggerDatabasePersistence(
  db: Pick<WorkflowDb, "transaction">,
  operations: WorkflowEventTriggerDatabaseOperations = defaultWorkflowEventTriggerDatabaseOperations,
) {
  return createWorkflowEventTriggerPersistence<WorkflowEventTx>({
    transaction: callback => db.transaction(async tx => callback(tx)),
    buildDependencies: (tx, organizationId) => ({
      claimReceipt: event => operations.claimReceipt(tx, event),
      findStartCandidates: ({ eventType }) => operations.findStartCandidates(tx, organizationId, eventType),
      findWaitingCandidates: ({ eventType }) => operations.findWaitingCandidates(tx, organizationId, eventType),
      startInstance: input => operations.startInstance(tx, {
        workflowId: input.workflowId,
        workflowVersionId: input.workflowVersionId,
        organizationId,
        triggerNodeId: input.triggerNodeId,
        eventId: input.eventId,
        eventType: input.eventType,
        producer: input.producer,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
        payload: input.payload,
      }),
      resumeInstance: input => operations.resumeInstance(tx, {
        executionId: input.executionId,
        workflowId: input.workflowId,
        workflowVersionId: input.workflowVersionId,
        organizationId,
        currentNodeId: input.currentNodeId,
        targetNodeId: input.targetNodeId,
        eventId: input.eventId,
        eventType: input.eventType,
        producer: input.producer,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
        payload: input.payload,
      }),
      completeReceipt: input => operations.completeReceipt(tx, input),
    }),
  });
}

export async function consumeWorkflowEventPersisted(
  input: WorkflowEventEnvelope,
  actorUserId: number,
): Promise<WorkflowEventTriggerResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return createWorkflowEventTriggerDatabasePersistence(db).consume(input, actorUserId);
}
