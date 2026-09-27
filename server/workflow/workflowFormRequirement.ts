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


export type WorkflowFormGateAction = "task_completion" | "transition";

export function assertWorkflowFormRequirementForAction(
  requirementInput: unknown,
  evidenceInput: unknown,
  action: WorkflowFormGateAction,
): void {
  const requirement = workflowFormRequirementSchema.parse(requirementInput);

  if (requirement.policy === "optional") return;
  if (requirement.policy === "required_before_transition" && action === "task_completion") return;

  if (!isWorkflowFormRequirementSatisfied(requirement, evidenceInput)) {
    throw new Error(
      action === "task_completion"
        ? "Formulário D-008 obrigatório deve possuir submissão válida antes de concluir a tarefa."
        : "Formulário D-008 obrigatório deve possuir submissão válida antes da transição.",
    );
  }
}

export function workflowFormRequirementFromDefinition(
  definitionValue: unknown,
  nodeId: string,
): WorkflowFormRequirement | null {
  if (!definitionValue || typeof definitionValue !== "object" || Array.isArray(definitionValue)) {
    return null;
  }
  const definition = definitionValue as Record<string, unknown>;
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const rawNode = nodes.find(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const node = raw as Record<string, unknown>;
    return node.id === nodeId;
  });
  if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) return null;
  const node = rawNode as Record<string, unknown>;
  if (node.type !== "form.d008") return null;
  return workflowFormRequirementSchema.parse(node.configuration);
}
