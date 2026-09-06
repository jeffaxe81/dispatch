import type { FormAnswers, FormSchemaDefinition } from "../../shared/forms";

export type FormDomainErrorCode =
  | "FORM_VERSION_IMMUTABLE"
  | "CORRECTION_REASON_REQUIRED"
  | "FORM_SCHEMA_INVALID";

export class FormDomainError extends Error {
  constructor(public readonly code: FormDomainErrorCode, message: string) {
    super(message);
    this.name = "FormDomainError";
  }
}

export type FormVersionStatus = "draft" | "published" | "retired";

export function assertDraftVersionEditable(status: FormVersionStatus): void {
  if (status !== "draft") {
    throw new FormDomainError("FORM_VERSION_IMMUTABLE", "Versões publicadas ou retiradas são imutáveis.");
  }
}

export function nextVersionNumber(existingVersions: readonly number[]): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildPublishedVersion(
  draft: { formId: number; version: number; definition: FormSchemaDefinition },
  actorUserId: number,
  now: Date,
) {
  if (!draft.definition || !Array.isArray(draft.definition.fields)) {
    throw new FormDomainError("FORM_SCHEMA_INVALID", "Definição do formulário inválida.");
  }

  return {
    formId: draft.formId,
    version: draft.version,
    definition: cloneJson(draft.definition),
    status: "published" as const,
    publishedByUserId: actorUserId,
    publishedAt: new Date(now.getTime()),
  };
}

export function buildSubmissionRevision(
  current: { submissionId: number; formVersionId: number; revision: number; answers: FormAnswers },
  correctedAnswers: FormAnswers,
  reason: string,
  actorUserId: number,
  now: Date,
) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new FormDomainError("CORRECTION_REASON_REQUIRED", "A correção exige uma justificativa auditável.");
  }

  return {
    submissionId: current.submissionId,
    formVersionId: current.formVersionId,
    revision: current.revision + 1,
    answers: cloneJson(correctedAnswers),
    reason: normalizedReason,
    actorUserId,
    createdAt: new Date(now.getTime()),
  };
}
