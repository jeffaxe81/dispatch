import type { AssetInventoryEvent } from "../assetInventoryEventConsumer";
import type { FormDomainEvent } from "../forms/formEvents";
import {
  WORKFLOW_ENVELOPE_VERSION,
  workflowEventEnvelopeSchema,
  type WorkflowEventEnvelope,
  type WorkflowEventType,
} from "../../shared/workflowIntegration/v1";

const FORM_EVENT_TYPES: Partial<Record<FormDomainEvent["eventType"], WorkflowEventType>> = {
  "submission.submitted": "form.submission.submitted.v1",
  "submission.corrected": "form.submission.corrected.v1",
};

const INVENTORY_EVENT_TYPES: Record<string, WorkflowEventType | undefined> = {
  "asset.created": "inventory.asset.created.v1",
  "asset.updated": "inventory.asset.updated.v1",
};

const DISPATCH_EVENT_TYPES = {
  "incident.created": "incident.created.v1",
  "incident.status_changed": "incident.status_changed.v1",
} as const satisfies Record<string, WorkflowEventType>;

export type DispatchWorkflowSourceEvent = {
  eventId: string;
  eventType: string;
  eventVersion: string;
  tenantId: string;
  correlationId: string;
  occurredAt: string;
  actorUserId?: string;
  payload: Record<string, unknown>;
};

function parseEnvelope(input: WorkflowEventEnvelope): WorkflowEventEnvelope {
  return workflowEventEnvelopeSchema.parse(input);
}

export function adaptFormEventToWorkflowEnvelope(
  event: FormDomainEvent,
  correlationId: string,
): WorkflowEventEnvelope {
  const eventType = FORM_EVENT_TYPES[event.eventType];
  if (!eventType) {
    throw new Error(`Evento D-008 não autorizado para Workflow: ${event.eventType}.`);
  }

  return parseEnvelope({
    envelopeVersion: WORKFLOW_ENVELOPE_VERSION,
    eventId: event.eventId,
    eventType,
    occurredAt: event.occurredAt.toISOString(),
    tenantId: String(event.tenantId),
    correlationId,
    actorUserId: String(event.actorUserId),
    producer: "d008-forms",
    payload: { ...event.payload },
  });
}

export function adaptInventoryEventToWorkflowEnvelope(
  event: AssetInventoryEvent,
): WorkflowEventEnvelope {
  if (event.eventVersion !== WORKFLOW_ENVELOPE_VERSION) {
    throw new Error(`Versão de evento do Inventário não suportada: ${event.eventVersion}.`);
  }
  const eventType = INVENTORY_EVENT_TYPES[event.eventType];
  if (!eventType) {
    throw new Error(`Evento do Inventário não autorizado para Workflow: ${event.eventType}.`);
  }

  return parseEnvelope({
    envelopeVersion: WORKFLOW_ENVELOPE_VERSION,
    eventId: event.eventId,
    eventType,
    occurredAt: event.occurredAt,
    tenantId: event.tenantId,
    correlationId: event.correlationId,
    producer: "asset-inventory",
    payload: { ...event.payload },
  });
}

export function adaptDispatchEventToWorkflowEnvelope(
  event: DispatchWorkflowSourceEvent,
): WorkflowEventEnvelope {
  if (event.eventVersion !== WORKFLOW_ENVELOPE_VERSION) {
    throw new Error(`Versão de evento do Despacho não suportada: ${event.eventVersion}.`);
  }
  const eventType = DISPATCH_EVENT_TYPES[event.eventType as keyof typeof DISPATCH_EVENT_TYPES];
  if (!eventType) {
    throw new Error(`Evento do Despacho não autorizado para Workflow: ${event.eventType}.`);
  }

  return parseEnvelope({
    envelopeVersion: WORKFLOW_ENVELOPE_VERSION,
    eventId: event.eventId,
    eventType,
    occurredAt: event.occurredAt,
    tenantId: event.tenantId,
    correlationId: event.correlationId,
    actorUserId: event.actorUserId,
    producer: "axe-dispatch",
    payload: { ...event.payload },
  });
}