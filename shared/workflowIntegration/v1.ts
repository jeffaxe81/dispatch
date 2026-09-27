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
  "incident.created.v1",
  "incident.status_changed.v1",
  "form.submission.submitted.v1",
  "form.submission.corrected.v1",
  "inventory.asset.created.v1",
  "inventory.asset.updated.v1",
] as const;

export const WORKFLOW_EVENT_PRODUCERS = [
  "axe-dispatch",
  "workflow-engine",
  "d008-forms",
  "asset-inventory",
] as const;

const opaqueIdSchema = z.string().trim().min(1).max(128);
const traceIdSchema = z.string().trim().min(8).max(160);

export const workflowEventTypeSchema = z.enum(WORKFLOW_EVENT_TYPES);
export const workflowEventProducerSchema = z.enum(WORKFLOW_EVENT_PRODUCERS);

const EXTERNAL_EVENT_PRODUCERS: Partial<Record<(typeof WORKFLOW_EVENT_TYPES)[number], (typeof WORKFLOW_EVENT_PRODUCERS)[number]>> = {
  "incident.created.v1": "axe-dispatch",
  "incident.status_changed.v1": "axe-dispatch",
  "form.submission.submitted.v1": "d008-forms",
  "form.submission.corrected.v1": "d008-forms",
  "inventory.asset.created.v1": "asset-inventory",
  "inventory.asset.updated.v1": "asset-inventory",
};

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
}).strict().superRefine((event, context) => {
  const expectedProducer = EXTERNAL_EVENT_PRODUCERS[event.eventType];
  if (expectedProducer && event.producer !== expectedProducer) {
    context.addIssue({
      code: "custom",
      path: ["producer"],
      message: `Produtor incompatível com o tipo de evento ${event.eventType}.`,
    });
  }
});

export type WorkflowEventType = z.infer<typeof workflowEventTypeSchema>;
export type WorkflowEventProducer = z.infer<typeof workflowEventProducerSchema>;
export type WorkflowEventEnvelope = z.infer<typeof workflowEventEnvelopeSchema>;