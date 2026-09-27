import { z } from "zod";

export const WORKFLOW_FORM_REQUIREMENT_POLICIES = [
  "optional",
  "required_before_task_completion",
  "required_before_transition",
] as const;

export const workflowFormRequirementPolicySchema = z.enum(
  WORKFLOW_FORM_REQUIREMENT_POLICIES,
);

const positiveIdSchema = z.number().int().positive();

export const workflowFormRequirementSchema = z.object({
  formId: positiveIdSchema,
  formVersionId: positiveIdSchema,
  policy: workflowFormRequirementPolicySchema,
}).strict();

export const WORKFLOW_FORM_SUBMISSION_STATUSES = [
  "in_progress",
  "submitted",
  "corrected",
] as const;

export const workflowFormSubmissionEvidenceSchema = z.object({
  submissionId: positiveIdSchema,
  formId: positiveIdSchema,
  formVersionId: positiveIdSchema,
  status: z.enum(WORKFLOW_FORM_SUBMISSION_STATUSES),
}).strict();

export type WorkflowFormRequirement = z.infer<
  typeof workflowFormRequirementSchema
>;

export type WorkflowFormSubmissionEvidence = z.infer<
  typeof workflowFormSubmissionEvidenceSchema
>;

export function isWorkflowFormRequirementSatisfied(
  requirementInput: unknown,
  evidenceInput: unknown,
): boolean {
  const requirement = workflowFormRequirementSchema.parse(requirementInput);

  if (requirement.policy === "optional") {
    return true;
  }

  const evidence = workflowFormSubmissionEvidenceSchema.safeParse(evidenceInput);
  if (!evidence.success) {
    return false;
  }

  if (
    evidence.data.formId !== requirement.formId
    || evidence.data.formVersionId !== requirement.formVersionId
  ) {
    return false;
  }

  return evidence.data.status === "submitted"
    || evidence.data.status === "corrected";
}
