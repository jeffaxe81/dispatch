import { describe, expect, it } from "vitest";
import { validateWorkflowDefinition } from "../dbLegacy";

function definition(formConfiguration: Record<string, unknown>) {
  return {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger.manual",
        label: "Início",
        position: { x: 0, y: 0 },
        configuration: { inputLabel: "Entrada" },
      },
      {
        id: "form-1",
        type: "form.d008",
        label: "Formulário obrigatório",
        position: { x: 180, y: 0 },
        configuration: formConfiguration,
      },
      {
        id: "notify-1",
        type: "notification.simulate",
        label: "Continuação",
        position: { x: 360, y: 0 },
        configuration: {
          channel: "painel_interno",
          messageTemplate: "Formulário satisfeito",
        },
      },
    ],
    edges: [
      { id: "trigger-form", source: "trigger-1", target: "form-1" },
      { id: "form-notify", source: "form-1", target: "notify-1" },
    ],
    metadata: {
      mode: "simulacao",
      definitionVersion: 1,
      automation: {
        requestedMode: "simulacao",
        activationRule: "manual",
        targetConnection: "nenhuma",
        activationStatus: "bloqueada",
        requiresApproval: true,
      },
    },
  };
}

describe("D-012H H2 — validação da definição form.d008", () => {
  it("aceita referência D-008 válida na publicação", () => {
    const report = validateWorkflowDefinition(definition({
      formId: 10,
      formVersionId: 25,
      policy: "required_before_task_completion",
    }), { forPublication: true });

    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("aceita política optional sem criar ownership de resposta", () => {
    const report = validateWorkflowDefinition(definition({
      formId: 10,
      formVersionId: 25,
      policy: "optional",
    }), { forPublication: true });

    expect(report.valid).toBe(true);
  });

  it("falha fechado para identificadores ou política inválidos", () => {
    for (const configuration of [
      { formId: 0, formVersionId: 25, policy: "required_before_task_completion" },
      { formId: 10, formVersionId: -1, policy: "required_before_transition" },
      { formId: 10, formVersionId: 25, policy: "execute_script" },
    ]) {
      const report = validateWorkflowDefinition(definition(configuration), { forPublication: true });
      expect(report.valid).toBe(false);
      expect(report.errors.join(" ")).toMatch(/formulário|D-008|referência|política|válid/i);
    }
  });

  it("rejeita conteúdo pertencente ao D-008 dentro da configuração do Workflow", () => {
    const report = validateWorkflowDefinition(definition({
      formId: 10,
      formVersionId: 25,
      policy: "required_before_transition",
      answers: { cpf: "não pertence ao Workflow" },
    }), { forPublication: true });

    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toMatch(/formulário|D-008|válid/i);
  });
});
