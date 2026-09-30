import { describe, expect, it } from "vitest";
import {
  isWorkflowFormRequirementSatisfied,
  workflowFormRequirementSchema,
  workflowFormSubmissionEvidenceSchema,
} from "./workflowFormRequirement";

describe("D-012H H1 — contrato de exigência de formulário", () => {
  const requirement = {
    formId: 10,
    formVersionId: 25,
    policy: "required_before_task_completion",
  } as const;

  it("aceita somente referências positivas e políticas autorizadas", () => {
    expect(workflowFormRequirementSchema.parse(requirement)).toEqual(requirement);
    expect(() => workflowFormRequirementSchema.parse({ ...requirement, formId: 0 })).toThrow();
    expect(() => workflowFormRequirementSchema.parse({ ...requirement, formVersionId: -1 })).toThrow();
    expect(() => workflowFormRequirementSchema.parse({ ...requirement, policy: "execute_script" })).toThrow();
    expect(() => workflowFormRequirementSchema.parse({ ...requirement, answers: { secret: "x" } })).toThrow();
  });

  it("mantém a evidência mínima sem conteúdo da resposta", () => {
    const evidence = {
      submissionId: 44,
      formId: 10,
      formVersionId: 25,
      status: "submitted",
    } as const;
    expect(workflowFormSubmissionEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(() => workflowFormSubmissionEvidenceSchema.parse({
      ...evidence,
      answers: { cpf: "não pertence ao Workflow" },
    })).toThrow();
  });

  it("considera submitted e corrected válidos somente para a mesma referência", () => {
    for (const status of ["submitted", "corrected"] as const) {
      expect(isWorkflowFormRequirementSatisfied(requirement, {
        submissionId: 44,
        formId: 10,
        formVersionId: 25,
        status,
      })).toBe(true);
    }

    expect(isWorkflowFormRequirementSatisfied(requirement, {
      submissionId: 44,
      formId: 10,
      formVersionId: 25,
      status: "in_progress",
    })).toBe(false);

    expect(isWorkflowFormRequirementSatisfied(requirement, {
      submissionId: 44,
      formId: 10,
      formVersionId: 99,
      status: "submitted",
    })).toBe(false);
  });

  it("não exige submissão quando a política é optional", () => {
    expect(isWorkflowFormRequirementSatisfied({
      ...requirement,
      policy: "optional",
    }, null)).toBe(true);
  });

  it("falha fechado quando exigência obrigatória não possui evidência", () => {
    expect(isWorkflowFormRequirementSatisfied(requirement, null)).toBe(false);
    expect(isWorkflowFormRequirementSatisfied({
      ...requirement,
      policy: "required_before_transition",
    }, null)).toBe(false);
  });
});
