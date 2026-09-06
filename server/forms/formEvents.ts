export const FORM_EVENT_TYPES = [
  "form.published",
  "submission.started",
  "submission.submitted",
  "submission.corrected",
  "form.disabled",
] as const;

export type FormEventType = typeof FORM_EVENT_TYPES[number];

export type FormDomainEvent = {
  eventId: string;
  eventType: FormEventType;
  tenantId: number;
  aggregateType: "form" | "submission";
  aggregateId: string;
  occurredAt: Date;
  actorUserId: number;
  payload: Record<string, unknown>;
};

export function buildFormDomainEvent(input: Omit<FormDomainEvent, "eventId"> & { eventId?: string }): FormDomainEvent {
  return {
    ...input,
    eventId: input.eventId ?? `${input.eventType}:${input.tenantId}:${input.aggregateId}:${input.occurredAt.getTime()}`,
    occurredAt: new Date(input.occurredAt.getTime()),
    payload: { ...input.payload },
  };
}
