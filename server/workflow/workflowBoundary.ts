import {
  workflowEventEnvelopeSchema,
  type WorkflowEventEnvelope,
} from "../../shared/workflowIntegration/v1";

export type WorkflowBoundaryErrorCode =
  | "workflow_event_invalid"
  | "workflow_tenant_mismatch";

export class WorkflowBoundaryError extends Error {
  constructor(
    public readonly code: WorkflowBoundaryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowBoundaryError";
  }
}

export function parseTrustedWorkflowEvent(
  input: unknown,
  trustedTenantId: string,
): WorkflowEventEnvelope {
  const parsed = workflowEventEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new WorkflowBoundaryError(
      "workflow_event_invalid",
      "Envelope de evento de workflow inválido.",
    );
  }
  if (parsed.data.tenantId !== trustedTenantId) {
    throw new WorkflowBoundaryError(
      "workflow_tenant_mismatch",
      "Tenant do evento não corresponde ao contexto confiável.",
    );
  }
  return parsed.data;
}

export function buildWorkflowIdempotencyKey(
  event: Pick<WorkflowEventEnvelope, "tenantId" | "eventId">,
): string {
  return `${encodeURIComponent(event.tenantId)}:${encodeURIComponent(event.eventId)}`;
}
