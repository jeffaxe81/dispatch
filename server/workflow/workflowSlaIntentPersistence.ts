import { and, eq } from "drizzle-orm";
import { workflowVersions } from "../../drizzle/schema";
import { getDb } from "../dbLegacy";
import {
  calculateWorkflowSlaTimeline,
  workflowSlaConfigurationSchema,
} from "./workflowSla";
import {
  createWorkflowSlaIntentRecorder,
  type WorkflowSlaPlannedIntent,
  type WorkflowSlaTaskSnapshot,
} from "./workflowSlaIntentRecorder";
import { workflowSlaEventIntents } from "./workflowSlaEventIntentSchema";
import { workflowInstanceExecutions } from "./workflowInstanceSchema";
import { workflowTasks } from "./workflowTaskSchema";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";

type WorkflowDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type WorkflowTx = Parameters<Parameters<WorkflowDb["transaction"]>[0]>[0];
type IntentRow = typeof workflowSlaEventIntents.$inferSelect;
type EventKind = IntentRow["eventKind"];

function eventKind(event: WorkflowSlaPlannedIntent): EventKind {
  const kind = event.eventType === "workflow.task.sla.reminder.v1" ? "reminder"
    : event.eventType === "workflow.task.sla.overdue.v1" ? "overdue"
      : "escalation";
  if (event.eventKey !== `${event.taskId}:${kind}`) {
    throw new Error("Chave de intenção SLA divergente do evento.");
  }
  return kind;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object"
    && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY");
}

function assertIntentMatches(
  existing: IntentRow,
  event: WorkflowSlaPlannedIntent,
  kind: EventKind,
) {
  if (existing.taskId !== event.taskId
    || existing.organizationId !== event.organizationId
    || existing.workflowVersionId !== event.workflowVersionId
    || existing.nodeId !== event.nodeId
    || existing.correlationId !== event.correlationId
    || existing.eventKind !== kind
    || existing.eventType !== event.eventType
    || existing.escalationMode !== (event.escalationMode ?? null)
    || existing.scheduledAt.getTime() !== new Date(event.scheduledAt).getTime()) {
    throw new Error("Intenção SLA existente diverge do snapshot congelado.");
  }
}

async function loadTaskForUpdate(
  tx: WorkflowTx,
  taskId: number,
  organizationId: number,
): Promise<WorkflowSlaTaskSnapshot | null> {
  const task = (
    await tx.select().from(workflowTasks)
      .where(eq(workflowTasks.id, taskId)).limit(1).for("update")
  )[0];
  if (!task) return null;

  // Lock the task before reading its tenant boundary and frozen definition.
  const tenantScope = (
    await tx.select({ organizationId: workflowExecutionTenantScopes.organizationId })
      .from(workflowExecutionTenantScopes)
      .where(eq(workflowExecutionTenantScopes.executionId, task.executionId))
      .limit(1)
  )[0];
  if (!tenantScope || tenantScope.organizationId !== organizationId) {
    throw new Error("Tarefa SLA fora do escopo da organização.");
  }

  const execution = (
    await tx.select().from(workflowInstanceExecutions)
      .where(eq(workflowInstanceExecutions.id, task.executionId)).limit(1)
  )[0];
  if (!execution || execution.workflowVersionId !== task.workflowVersionId
    || typeof execution.correlationId !== "string" || !execution.correlationId.trim()) {
    throw new Error("Execução SLA sem versão/correlação congelada válida.");
  }

  const version = (
    await tx.select({
      workflowId: workflowVersions.workflowId,
      definition: workflowVersions.definition,
    }).from(workflowVersions)
      .where(eq(workflowVersions.id, task.workflowVersionId)).limit(1)
  )[0];
  if (!version || version.workflowId !== execution.workflowId) {
    throw new Error("Versão SLA não corresponde à execução.");
  }
  const definition = version.definition;
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new Error("Definição publicada de SLA inválida.");
  }
  const nodes = (definition as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) throw new Error("Definição SLA sem nós.");
  const matching = nodes.filter(node =>
    node && typeof node === "object" && !Array.isArray(node)
    && (node as { id?: unknown }).id === task.nodeId);
  if (matching.length !== 1) throw new Error("Nó SLA ausente ou ambíguo.");
  const node = matching[0] as { configuration?: unknown };
  const configuration = node.configuration && typeof node.configuration === "object"
    && !Array.isArray(node.configuration)
    ? node.configuration as Record<string, unknown> : {};
  const timestamps = [
    task.slaStartedAt, task.slaReminderAt,
    task.slaDueAt, task.slaEscalationAt,
  ];

  if (configuration.sla === undefined) {
    if (timestamps.some(value => value !== null)) {
      throw new Error("Timestamps SLA sem configuração na versão congelada.");
    }
    return {
      taskId, organizationId, workflowVersionId: task.workflowVersionId,
      nodeId: task.nodeId, correlationId: execution.correlationId,
      status: task.status, slaReminderAt: null, slaDueAt: null,
      slaEscalationAt: null, escalationMode: "notify_only",
    };
  }

  const frozen = workflowSlaConfigurationSchema.parse(configuration.sla);
  if (timestamps.some(value => value === null)) {
    throw new Error("Timeline SLA incompleta na tarefa persistida.");
  }
  const expected = calculateWorkflowSlaTimeline(
    frozen,
    task.slaStartedAt!.toISOString(),
  );
  if (task.slaReminderAt!.toISOString() !== expected.reminderAt
    || task.slaDueAt!.toISOString() !== expected.dueAt
    || task.slaEscalationAt!.toISOString() !== expected.escalationAt) {
    throw new Error("Timeline SLA diverge da versão publicada congelada.");
  }
  return {
    taskId, organizationId, workflowVersionId: task.workflowVersionId,
    nodeId: task.nodeId, correlationId: execution.correlationId,
    status: task.status,
    slaReminderAt: task.slaReminderAt!.toISOString(),
    slaDueAt: task.slaDueAt!.toISOString(),
    slaEscalationAt: task.slaEscalationAt!.toISOString(),
    escalationMode: frozen.escalationMode,
  };
}

async function insertIntentIfAbsent(
  tx: WorkflowTx,
  event: WorkflowSlaPlannedIntent,
): Promise<"created" | "duplicate"> {
  const kind = eventKind(event);
  const queryExisting = async () => (
    await tx.select().from(workflowSlaEventIntents)
      .where(and(
        eq(workflowSlaEventIntents.taskId, event.taskId),
        eq(workflowSlaEventIntents.eventKind, kind),
      )).limit(1).for("update")
  )[0];

  const existing = await queryExisting();
  if (existing) {
    assertIntentMatches(existing, event, kind);
    return "duplicate";
  }
  try {
    await tx.insert(workflowSlaEventIntents).values({
      taskId: event.taskId,
      organizationId: event.organizationId,
      workflowVersionId: event.workflowVersionId,
      nodeId: event.nodeId,
      correlationId: event.correlationId,
      eventKind: kind,
      eventType: event.eventType,
      escalationMode: event.escalationMode ?? null,
      scheduledAt: new Date(event.scheduledAt),
      status: "pending",
    });
    return "created";
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const concurrent = await queryExisting();
    if (!concurrent) throw error;
    assertIntentMatches(concurrent, event, kind);
    return "duplicate";
  }
}

/**
 * Explicit entry point for a future scheduler. No timers, HTTP publishing,
 * task reassignment, or incident mutation are enabled here.
 */
export async function recordWorkflowSlaIntentsForTask(input: {
  taskId: number;
  organizationId: number;
  now: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return createWorkflowSlaIntentRecorder<WorkflowTx>({
    transaction: callback => db.transaction(async tx => callback(tx)),
    loadTaskForUpdate,
    insertIntentIfAbsent,
  }).recordForTask(input);
}
