import { and, eq } from "drizzle-orm";
import { workflowVersions, workflows } from "../../drizzle/schema";
import type { WorkflowEventEnvelope } from "../../shared/workflowIntegration/v1";
import { getDb } from "../dbLegacy";
import { claimWorkflowEventReceipt } from "./workflowEventReceiptStore";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import { workflowTenantScopes } from "./workflowTenantScopeSchema";
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

export async function consumeWorkflowEventPersisted(
  input: WorkflowEventEnvelope,
  _actorUserId: number,
): Promise<WorkflowEventTriggerResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return db.transaction(async tx => {
    const claim = await claimWorkflowEventReceipt(tx, input);
    if (claim.status === "duplicate") {
      return {
        status: "duplicate",
        eventId: input.eventId,
        executionIds: [],
      };
    }

    throw new Error("Consumer persistente D-012F ainda não está conectado ao matching e start do runtime de workflow.");
  });
}
