import { z } from "zod";

export const WORKFLOW_CONTRACT_VERSION = "v1" as const;
export const WORKFLOW_ENVELOPE_VERSION = "1" as const;

export const WORKFLOW_EVENT_TYPES = [
  "workflow.manual.requested.v1",
  "workflow.instance.started.v1",
  "workflow.instance.transitioned.v1",
  "workflow.instance.completed.v1",
  "workflow.instance.failed.v1",
  "workflow.task.opened.v1",
  "workflow.task.completed.v1",
] as const;

export const WORKFLOW_EVENT_PRODUCERS = [
  "axe-dispatch",
  "workflow-engine",
] as const;

const opaqueIdSchema = z.string().trim().min(1).max(128);
const traceIdSchema = z.string().trim().min(8).max(160);

export const workflowEventTypeSchema = z.enum(WORKFLOW_EVENT_TYPES);
export const workflowEventProducerSchema = z.enum(WORKFLOW_EVENT_PRODUCERS);

export const workflowEventEnvelopeSchema = z.object({
  envelopeVersion: z.literal(WORKFLOW_ENVELOPE_VERSION),
  eventId: traceIdSchema,
  eventType: workflowEventTypeSchema,
  occurredAt: z.string().datetime({ offset: true }),
  tenantId: opaqueIdSchema,
  correlationId: traceIdSchema,
  actorUserId: opaqueIdSchema.optional(),
  producer: workflowEventProducerSchema,
  payload: z.record(z.string(), z.unknown()),
}).strict();

export type WorkflowEventType = z.infer<typeof workflowEventTypeSchema>;
export type WorkflowEventProducer = z.infer<typeof workflowEventProducerSchema>;
export type WorkflowEventEnvelope = z.infer<typeof workflowEventEnvelopeSchema>;
