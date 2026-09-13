import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  workflowEventEnvelopeSchema,
  type WorkflowEventEnvelope,
} from "../../shared/workflowIntegration/v1";
import { workflowEventReceipts } from "./workflowEventReceiptSchema";

type WorkflowEventReceiptTransaction = Pick<
  MySql2Database<Record<string, never>>,
  "select" | "insert" | "update"
>;

export type WorkflowEventReceiptClaim =
  | { status: "claimed"; tenantId: string; eventId: string }
  | { status: "duplicate"; tenantId: string; eventId: string };

export type WorkflowEventReceiptCompletion = {
  tenantId: string;
  eventId: string;
  status: "processed" | "ignored" | "failed";
  workflowExecutionId?: number | null;
  failureCode?: string | null;
};

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: string }).code === "ER_DUP_ENTRY",
  );
}

async function findReceiptForUpdate(
  tx: WorkflowEventReceiptTransaction,
  tenantId: string,
  eventId: string,
) {
  const rows = await tx
    .select({ id: workflowEventReceipts.id })
    .from(workflowEventReceipts)
    .where(and(
      eq(workflowEventReceipts.tenantId, tenantId),
      eq(workflowEventReceipts.eventId, eventId),
    ))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

export async function claimWorkflowEventReceipt(
  tx: WorkflowEventReceiptTransaction,
  input: WorkflowEventEnvelope,
): Promise<WorkflowEventReceiptClaim> {
  const envelope = workflowEventEnvelopeSchema.parse(input);
  const existing = await findReceiptForUpdate(tx, envelope.tenantId, envelope.eventId);
  if (existing) {
    return { status: "duplicate", tenantId: envelope.tenantId, eventId: envelope.eventId };
  }

  try {
    await tx.insert(workflowEventReceipts).values({
      tenantId: envelope.tenantId,
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      producer: envelope.producer,
      correlationId: envelope.correlationId,
      status: "pending",
    });
    return { status: "claimed", tenantId: envelope.tenantId, eventId: envelope.eventId };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { status: "duplicate", tenantId: envelope.tenantId, eventId: envelope.eventId };
    }
    throw error;
  }
}

export async function completeWorkflowEventReceipt(
  tx: WorkflowEventReceiptTransaction,
  input: WorkflowEventReceiptCompletion,
): Promise<void> {
  await tx
    .update(workflowEventReceipts)
    .set({
      status: input.status,
      workflowExecutionId: input.workflowExecutionId ?? null,
      failureCode: input.failureCode ?? null,
      processedAt: new Date(),
    })
    .where(and(
      eq(workflowEventReceipts.tenantId, input.tenantId),
      eq(workflowEventReceipts.eventId, input.eventId),
    ));
}