import { and, eq } from "drizzle-orm";
import { auditLogs, workflowExecutions, workflowVersions } from "../../drizzle/schema";
import type { WorkflowEventEnvelope } from "../../shared/workflowIntegration/v1";
import { getDb } from "../dbLegacy";
import {
  readWorkflowFormEvidence,
  workflowFormEvidenceFromEnvelope,
  writeWorkflowFormEvidence,
} from "./workflowFormEventEvidence";
import { workflowFormRequirementSchema } from "./workflowFormRequirement";
import { resumeFormWorkflowInstanceInTransaction } from "./workflowInstancePersistence";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import {
  resumeWaitingWorkflowInstanceState,
  type WorkflowInstanceGraph,
  type WorkflowInstanceState,
} from "./workflowInstanceStateMachine";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";

type WorkflowFormEvidenceCandidate = {
  executionId: number;
  nodeId: string;
  outputData: unknown;
  policy?: "optional" | "required_before_task_completion" | "required_before_transition";
};

type WorkflowFormEvidenceAdapter<TTransaction> = {
  transaction<TResult>(callback: (transaction: TTransaction) => Promise<TResult>): Promise<TResult>;
  findCandidates(
    transaction: TTransaction,
    input: {
      organizationId: number;
      correlationId: string;
      formId: number;
      formVersionId: number;
    },
  ): Promise<WorkflowFormEvidenceCandidate[]>;
  persistEvidence(
    transaction: TTransaction,
    input: WorkflowFormEvidenceCandidate & {
      evidence: ReturnType<typeof workflowFormEvidenceFromEnvelope>;
      outputData: Record<string, unknown>;
    },
  ): Promise<void>;
  auditEvidence(
    transaction: TTransaction,
    input: {
      executionId: number;
      nodeId: string;
      actorUserId: number;
      correlationId: string;
      evidence: ReturnType<typeof workflowFormEvidenceFromEnvelope>;
    },
  ): Promise<void>;
  afterPersist?(
    transaction: TTransaction,
    input: {
      organizationId: number;
      executionId: number;
      nodeId: string;
      policy?: "optional" | "required_before_task_completion" | "required_before_transition";
      actorUserId: number;
      correlationId: string;
    },
  ): Promise<void>;
};

export type WorkflowFormEvidenceConsumeResult =
  | { status: "processed"; executionId: number; nodeId: string }
  | { status: "duplicate"; executionId: number; nodeId: string }
  | { status: "ignored" };

function parseOrganizationId(tenantId: string): number {
  if (!/^[1-9]\d*$/.test(tenantId)) {
    throw new Error("tenantId D-008 inválido para correlação de formulário.");
  }
  const value = Number(tenantId);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("tenantId D-008 fora do intervalo suportado.");
  }
  return value;
}

function assertActorUserId(actorUserId: number) {
  if (!Number.isInteger(actorUserId) || actorUserId < 1) {
    throw new Error("actorUserId inválido para evidência D-008.");
  }
}

function sameEvidence(
  left: ReturnType<typeof workflowFormEvidenceFromEnvelope>,
  right: ReturnType<typeof workflowFormEvidenceFromEnvelope>,
) {
  return left.submissionId === right.submissionId
    && left.formId === right.formId
    && left.formVersionId === right.formVersionId
    && left.status === right.status;
}

export function createWorkflowFormEvidencePersistence<TTransaction>(
  adapter: WorkflowFormEvidenceAdapter<TTransaction>,
) {
  return {
    async consume(
      envelope: WorkflowEventEnvelope,
      actorUserId: number,
    ): Promise<WorkflowFormEvidenceConsumeResult> {
      assertActorUserId(actorUserId);
      const evidence = workflowFormEvidenceFromEnvelope(envelope);
      const organizationId = parseOrganizationId(envelope.tenantId);

      return adapter.transaction(async transaction => {
        const candidates = await adapter.findCandidates(transaction, {
          organizationId,
          correlationId: envelope.correlationId,
          formId: evidence.formId,
          formVersionId: evidence.formVersionId,
        });

        if (candidates.length === 0) return { status: "ignored" };
        if (candidates.length > 1) {
          throw new Error("Correlação ambígua: mais de uma instância aguarda a mesma evidência D-008.");
        }

        const candidate = candidates[0];
        const existing = readWorkflowFormEvidence(candidate.outputData, candidate.nodeId);
        if (existing && sameEvidence(existing, evidence)) {
          return {
            status: "duplicate",
            executionId: candidate.executionId,
            nodeId: candidate.nodeId,
          };
        }

        const outputData = writeWorkflowFormEvidence(
          candidate.outputData,
          candidate.nodeId,
          evidence,
        );
        await adapter.persistEvidence(transaction, {
          ...candidate,
          evidence,
          outputData,
        });
        await adapter.auditEvidence(transaction, {
          executionId: candidate.executionId,
          nodeId: candidate.nodeId,
          actorUserId,
          correlationId: envelope.correlationId,
          evidence,
        });
        await adapter.afterPersist?.(transaction, {
          organizationId,
          executionId: candidate.executionId,
          nodeId: candidate.nodeId,
          policy: candidate.policy,
          actorUserId,
          correlationId: envelope.correlationId,
        });

        return {
          status: "processed",
          executionId: candidate.executionId,
          nodeId: candidate.nodeId,
        };
      });
    },
  };
}

export function resolveWorkflowFormStepFromExecutionOutput(input: {
  state: WorkflowInstanceState;
  graph: WorkflowInstanceGraph;
  outputData: unknown;
  targetNodeId?: string;
  actorUserId: number;
  correlationId: string;
  occurredAt: string;
}) {
  const currentNode = input.graph.nodes.find(node => node.id === input.state.currentNodeId);
  if (!currentNode || currentNode.type !== "form.d008" || !currentNode.formRequirement) {
    throw new Error("Instância não está posicionada em um nó form.d008 válido.");
  }

  const outgoing = input.graph.edges.filter(edge => edge.source === input.state.currentNodeId);
  if (outgoing.length !== 1) {
    throw new Error("Nó form.d008 deve possuir exatamente uma saída para retomada.");
  }
  const targetNodeId = input.targetNodeId ?? outgoing[0].target;
  if (targetNodeId !== outgoing[0].target) {
    throw new Error("Destino informado diverge da versão congelada do nó form.d008.");
  }

  return resumeWaitingWorkflowInstanceState({
    state: input.state,
    graph: input.graph,
    targetNodeId,
    formSubmissionEvidence: readWorkflowFormEvidence(input.outputData, input.state.currentNodeId),
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
  });
}

type WorkflowDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type WorkflowFormTx = Parameters<Parameters<WorkflowDb["transaction"]>[0]>[0];

function rawNodeConfiguration(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

async function findCandidates(
  tx: WorkflowFormTx,
  input: {
    organizationId: number;
    correlationId: string;
    formId: number;
    formVersionId: number;
  },
): Promise<WorkflowFormEvidenceCandidate[]> {
  const scopes = await tx
    .select({ executionId: workflowExecutionTenantScopes.executionId })
    .from(workflowExecutionTenantScopes)
    .where(eq(workflowExecutionTenantScopes.organizationId, input.organizationId))
    .limit(1000);

  const candidates: WorkflowFormEvidenceCandidate[] = [];
  for (const scope of scopes) {
    const execution = (
      await tx
        .select()
        .from(workflowExecutions)
        .where(eq(workflowExecutions.id, scope.executionId))
        .limit(1)
        .for("update")
    )[0];
    if (
      !execution
      || execution.mode !== "simulacao"
      || execution.status !== "pendente"
      || !execution.workflowVersionId
    ) continue;

    const projection = (
      await tx
        .select({
          currentNodeId: workflowInstanceExecutions.currentNodeId,
          correlationId: workflowInstanceExecutions.correlationId,
        })
        .from(workflowInstanceExecutions)
        .where(eq(workflowInstanceExecutions.id, execution.id))
        .limit(1)
    )[0];
    if (
      !projection?.currentNodeId
      || projection.correlationId !== input.correlationId
    ) continue;

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

    const definition = rawNodeConfiguration(version.definition);
    const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
    const rawNode = nodes.find(raw => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
      const node = raw as Record<string, unknown>;
      return node.id === projection.currentNodeId && node.type === "form.d008";
    }) as Record<string, unknown> | undefined;
    if (!rawNode) continue;

    const requirement = workflowFormRequirementSchema.safeParse(
      rawNodeConfiguration(rawNode.configuration),
    );
    if (!requirement.success) continue;
    if (
      requirement.data.formId !== input.formId
      || requirement.data.formVersionId !== input.formVersionId
    ) continue;

    candidates.push({
      executionId: execution.id,
      nodeId: projection.currentNodeId,
      outputData: execution.outputData,
      policy: requirement.data.policy,
    });
  }
  return candidates;
}

async function persistEvidence(
  tx: WorkflowFormTx,
  input: WorkflowFormEvidenceCandidate & {
    evidence: ReturnType<typeof workflowFormEvidenceFromEnvelope>;
    outputData: Record<string, unknown>;
  },
) {
  await tx
    .update(workflowExecutions)
    .set({ outputData: input.outputData })
    .where(eq(workflowExecutions.id, input.executionId));
}

async function auditEvidence(
  tx: WorkflowFormTx,
  input: {
    executionId: number;
    nodeId: string;
    actorUserId: number;
    correlationId: string;
    evidence: ReturnType<typeof workflowFormEvidenceFromEnvelope>;
  },
) {
  await tx.insert(auditLogs).values({
    resourceType: "workflow_instance",
    resourceId: input.executionId,
    action: "workflow_instance.form_evidence",
    actorUserId: input.actorUserId,
    beforeData: null,
    afterData: {
      nodeId: input.nodeId,
      correlationId: input.correlationId,
      formId: input.evidence.formId,
      formVersionId: input.evidence.formVersionId,
      submissionId: input.evidence.submissionId,
      status: input.evidence.status,
    },
  });
}

export async function consumeWorkflowFormEvidencePersisted(
  envelope: WorkflowEventEnvelope,
  actorUserId: number,
): Promise<WorkflowFormEvidenceConsumeResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return createWorkflowFormEvidencePersistence<WorkflowFormTx>({
    transaction: callback => db.transaction(async tx => callback(tx)),
    findCandidates,
    persistEvidence,
    auditEvidence,
    afterPersist: async (tx, input) => {
      if (input.policy !== "required_before_transition") return;
      await resumeFormWorkflowInstanceInTransaction(tx, {
        executionId: input.executionId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
      });
    },
  }).consume(envelope, actorUserId);
}
