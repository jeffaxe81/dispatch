import { z } from "zod";
import {
  workflowEventEnvelopeSchema,
  type WorkflowEventEnvelope,
} from "../../shared/workflowIntegration/v1";
import {
  workflowFormSubmissionEvidenceSchema,
  type WorkflowFormSubmissionEvidence,
} from "./workflowFormRequirement";

const workflowFormEvidencePayloadSchema = z.object({
  submissionId: z.number().int().positive(),
  formId: z.number().int().positive(),
  formVersionId: z.number().int().positive(),
}).passthrough();

const FORM_EVIDENCE_KEY = "workflowFormEvidenceByNode";

function asOutputRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("outputData do Workflow deve ser um objeto para persistir evidência de formulário.");
  }
  return value as Record<string, unknown>;
}

function requireNodeId(nodeId: string): string {
  const value = nodeId.trim();
  if (!value || value.length > 120 || value === "__proto__" || value === "constructor" || value === "prototype") {
    throw new Error("nodeId inválido para evidência de formulário.");
  }
  return value;
}

export function workflowFormEvidenceFromEnvelope(
  input: WorkflowEventEnvelope,
): WorkflowFormSubmissionEvidence {
  const envelope = workflowEventEnvelopeSchema.parse(input);
  if (envelope.producer !== "d008-forms") {
    throw new Error("Evento de evidência de formulário deve ser produzido pelo D-008.");
  }

  const status = envelope.eventType === "form.submission.submitted.v1"
    ? "submitted"
    : envelope.eventType === "form.submission.corrected.v1"
      ? "corrected"
      : null;
  if (!status) {
    throw new Error("Evento D-008 não autorizado como evidência de submissão.");
  }

  const payload = workflowFormEvidencePayloadSchema.safeParse(envelope.payload);
  if (!payload.success) {
    throw new Error("Payload de evidência de formulário inválido.");
  }

  return workflowFormSubmissionEvidenceSchema.parse({
    submissionId: payload.data.submissionId,
    formId: payload.data.formId,
    formVersionId: payload.data.formVersionId,
    status,
  });
}

export function writeWorkflowFormEvidence(
  outputData: unknown,
  nodeId: string,
  evidenceInput: unknown,
): Record<string, unknown> {
  const output = asOutputRecord(outputData);
  const evidence = workflowFormSubmissionEvidenceSchema.parse(evidenceInput);
  const key = requireNodeId(nodeId);
  const existingRaw = output[FORM_EVIDENCE_KEY];
  const existing = existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
    ? existingRaw as Record<string, unknown>
    : {};

  return {
    ...output,
    [FORM_EVIDENCE_KEY]: {
      ...existing,
      [key]: evidence,
    },
  };
}

export function readWorkflowFormEvidence(
  outputData: unknown,
  nodeId: string,
): WorkflowFormSubmissionEvidence | null {
  const output = asOutputRecord(outputData);
  const key = requireNodeId(nodeId);
  const container = output[FORM_EVIDENCE_KEY];
  if (!container || typeof container !== "object" || Array.isArray(container)) return null;
  const candidate = (container as Record<string, unknown>)[key];
  const parsed = workflowFormSubmissionEvidenceSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
