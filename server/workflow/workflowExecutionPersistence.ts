import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  auditLogs,
  integrationLogs,
  workflowExecutions,
  workflowExecutionSteps,
  workflowVersions,
  workflows,
} from "../../drizzle/schema";
import {
  buildSimulatedExecutionPlan,
  getDb,
  validateWorkflowDefinition,
} from "../dbLegacy";
import { assertLegacyExecutorSupportsDefinition } from "./workflowHumanTaskPolicy";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import { assertWorkflowTenant } from "./workflowTenantAccess";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";

function buildWorkflowExecutionAuditLog(input: {
  executionId: number;
  workflowId: number;
  actorUserId: number;
  action: "queue" | "complete" | "fail" | "dead_letter" | "retry";
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
}) {
  return {
    resourceType: "workflow_execution",
    resourceId: input.executionId,
    action: `workflow_execution.${input.action}`,
    actorUserId: input.actorUserId,
    beforeData: { workflowId: input.workflowId, ...input.beforeData },
    afterData: input.afterData,
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

async function assertExecutionTenant(
  tx: { select: (...args: any[]) => any },
  executionId: number,
  organizationId: number,
) {
  const scope = (await tx
    .select({ organizationId: workflowExecutionTenantScopes.organizationId })
    .from(workflowExecutionTenantScopes)
    .where(eq(workflowExecutionTenantScopes.executionId, executionId))
    .limit(1))[0] as { organizationId: number } | undefined;
  if (!scope?.organizationId) throw new Error("Execução sem escopo de tenant mapeado.");
  if (scope.organizationId !== organizationId) throw new Error("Execução pertence a outra organização.");
  return scope.organizationId;
}

async function processSimulatedWorkflowExecution(executionId: number, actorUserId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const execution = (await tx.select().from(workflowExecutions).where(eq(workflowExecutions.id, executionId)).limit(1))[0];
    if (!execution) throw new Error("Execução não encontrada.");
    if (execution.mode !== "simulacao") throw new Error("Este executor aceita somente execuções em modo de simulação.");
    if (execution.status !== "pendente") return { executionId, status: execution.status, skipped: true };

    const version = execution.workflowVersionId
      ? (await tx.select().from(workflowVersions).where(eq(workflowVersions.id, execution.workflowVersionId)).limit(1))[0]
      : null;
    if (!version) throw new Error("A versão do workflow desta execução não foi encontrada.");
    assertLegacyExecutorSupportsDefinition(version.definition);

    const attempt = execution.attempts + 1;
    const now = new Date();
    const plan = buildSimulatedExecutionPlan(version.definition, execution.inputData, attempt, execution.maxAttempts);

    await tx.update(workflowExecutions).set({ status: "em_execucao", attempts: attempt, startedAt: now }).where(eq(workflowExecutions.id, executionId));
    await tx.insert(integrationLogs).values({
      executionId,
      workflowId: execution.workflowId,
      level: "info",
      source: "workflow.executor.simulacao",
      message: "Execução retirada da fila para processamento controlado.",
      requestData: { mode: "simulacao", attempt, externalRequests: 0 },
      retryAttempt: attempt - 1,
    });

    for (const step of plan.steps) {
      await tx.insert(workflowExecutionSteps).values({
        executionId,
        nodeId: step.nodeId,
        nodeType: step.nodeType,
        status: step.status,
        inputData: { simulation: true },
        outputData: step.outputData,
        errorData: step.errorData,
        durationMs: step.durationMs,
        startedAt: now,
        completedAt: new Date(now.getTime() + step.durationMs),
      });
    }

    const completedAt = new Date(now.getTime() + plan.steps.reduce((total, step) => total + step.durationMs, 0));
    await tx.update(workflowExecutions).set({
      status: plan.finalStatus,
      outputData: plan.outputData,
      errorData: plan.errorData,
      completedAt,
      nextAttemptAt: plan.finalStatus === "falha" ? new Date(completedAt.getTime() + 60_000) : null,
    }).where(eq(workflowExecutions.id, executionId));

    const level = plan.finalStatus === "concluida" ? "sucesso" : "erro";
    const action = plan.finalStatus === "concluida" ? "complete" : plan.finalStatus === "dead_letter" ? "dead_letter" : "fail";
    await tx.insert(integrationLogs).values({
      executionId,
      workflowId: execution.workflowId,
      level,
      source: "workflow.executor.simulacao",
      message: plan.finalStatus === "concluida"
        ? "Execução simulada concluída sem chamadas externas."
        : "Execução simulada finalizada com falha controlada.",
      responseData: plan.outputData,
      retryAttempt: attempt - 1,
      errorCode: plan.errorData?.code as string | undefined,
    });
    await tx.insert(auditLogs).values(buildWorkflowExecutionAuditLog({
      executionId,
      workflowId: execution.workflowId,
      actorUserId,
      action,
      beforeData: { status: "pendente", attempts: execution.attempts },
      afterData: { status: plan.finalStatus, attempts: attempt, simulationOnly: true },
    }));

    return {
      executionId,
      status: plan.finalStatus,
      attempts: attempt,
      outputData: plan.outputData,
      errorData: plan.errorData,
    };
  });
}

export async function executeSimulatedWorkflow(input: {
  workflowId: number;
  organizationId: number;
  actorUserId: number;
  inputData?: Record<string, unknown> | null;
  attemptsBefore?: number;
  retrySourceExecutionId?: number;
}) {
  const db = await requireDb();
  const queued = await db.transaction(async tx => {
    await assertWorkflowTenant(tx, input.workflowId, input.organizationId);
    const workflow = (await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1))[0];
    if (!workflow) throw new Error("Workflow não encontrado.");
    if (!workflow.simulationOnly) throw new Error("Esta entrega executa somente workflows em modo de simulação.");
    if (!workflow.active) throw new Error("Publique e ative o workflow antes de executar uma simulação.");

    const pointer = (await tx.select().from(workflowPublicationPointers).where(eq(workflowPublicationPointers.id, input.workflowId)).limit(1))[0];
    if (!pointer?.publishedVersion) throw new Error("O workflow ativo não possui versão publicada válida.");

    const version = (await tx.select().from(workflowVersions).where(and(
      eq(workflowVersions.workflowId, input.workflowId),
      eq(workflowVersions.version, pointer.publishedVersion),
    )).limit(1))[0];
    if (!version) throw new Error("A versão publicada do workflow não foi encontrada.");

    const validation = validateWorkflowDefinition(version.definition, { forPublication: true });
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    assertLegacyExecutorSupportsDefinition(version.definition);

    const attemptsBefore = input.attemptsBefore ?? 0;
    const triggerType = input.retrySourceExecutionId ? "manual_retry" : "manual";
    const [created] = await tx.insert(workflowExecutions).values({
      workflowId: input.workflowId,
      workflowVersionId: version.id,
      triggerType,
      mode: "simulacao",
      status: "pendente",
      idempotencyKey: `${triggerType}-${nanoid(18)}`,
      inputData: {
        simulation: true,
        ...(input.inputData ?? {}),
        ...(input.retrySourceExecutionId ? { reprocessedFromExecutionId: input.retrySourceExecutionId } : {}),
      },
      attempts: attemptsBefore,
      maxAttempts: 3,
      retryOfExecutionId: input.retrySourceExecutionId ?? null,
      initiatedByUserId: input.actorUserId,
    }).$returningId();
    await tx.insert(workflowExecutionTenantScopes).values({ executionId: created.id, organizationId: input.organizationId });

    await tx.insert(integrationLogs).values({
      executionId: created.id,
      workflowId: input.workflowId,
      level: "info",
      source: "workflow.executor.simulacao",
      message: input.retrySourceExecutionId
        ? "Nova tentativa reenfileirada em modo de simulação."
        : "Execução manual enfileirada em modo de simulação.",
      requestData: {
        externalRequests: 0,
        retrySourceExecutionId: input.retrySourceExecutionId ?? null,
        publishedVersion: pointer.publishedVersion,
      },
      retryAttempt: attemptsBefore,
    });
    await tx.insert(auditLogs).values(buildWorkflowExecutionAuditLog({
      executionId: created.id,
      workflowId: input.workflowId,
      actorUserId: input.actorUserId,
      action: "queue",
      beforeData: null,
      afterData: {
        status: "pendente",
        triggerType,
        attemptsBefore,
        publishedVersion: pointer.publishedVersion,
        simulationOnly: true,
        organizationId: input.organizationId,
      },
    }));
    return created.id;
  });

  return processSimulatedWorkflowExecution(queued, input.actorUserId);
}

export async function retrySimulatedWorkflowExecution(input: { executionId: number; organizationId: number; actorUserId: number }) {
  const db = await requireDb();
  const source = await db.transaction(async tx => {
    await assertExecutionTenant(tx, input.executionId, input.organizationId);
    const current = (await tx.select().from(workflowExecutions).where(eq(workflowExecutions.id, input.executionId)).limit(1))[0];
    if (!current) throw new Error("Execução não encontrada.");
    if (current.mode !== "simulacao" || current.status !== "falha") throw new Error("Somente execuções simuladas em falha podem ser reenfileiradas.");
    const existingRetry = (await tx.select().from(workflowExecutions).where(eq(workflowExecutions.retryOfExecutionId, current.id)).limit(1))[0];
    if (existingRetry) throw new Error("Esta falha já foi reprocessada. Use a tentativa mais recente para continuar o ciclo.");
    return current;
  });

  let result: Awaited<ReturnType<typeof executeSimulatedWorkflow>>;
  try {
    result = await executeSimulatedWorkflow({
      workflowId: source.workflowId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      inputData: source.inputData,
      attemptsBefore: source.attempts,
      retrySourceExecutionId: source.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("workflow_executions_retry_source_unique")) {
      throw new Error("Esta falha já foi reprocessada por outra solicitação. Atualize o histórico para usar a tentativa mais recente.");
    }
    throw error;
  }

  await db.transaction(async tx => {
    await tx.insert(integrationLogs).values({
      executionId: source.id,
      workflowId: source.workflowId,
      level: "aviso",
      source: "workflow.executor.simulacao",
      message: "Execução reprocessada em novo registro para preservar etapas e histórico da tentativa anterior.",
      requestData: { newExecutionId: result.executionId },
      retryAttempt: source.attempts,
    });
    await tx.insert(auditLogs).values(buildWorkflowExecutionAuditLog({
      executionId: source.id,
      workflowId: source.workflowId,
      actorUserId: input.actorUserId,
      action: "retry",
      beforeData: { status: source.status, attempts: source.attempts },
      afterData: { newExecutionId: result.executionId, nextAttempt: source.attempts + 1, simulationOnly: true, organizationId: input.organizationId },
    }));
  });

  return result;
}
