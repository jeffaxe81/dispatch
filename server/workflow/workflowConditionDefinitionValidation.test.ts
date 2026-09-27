import { describe, expect, it } from "vitest";
import { validateWorkflowDefinition } from "../dbLegacy";

function definition(decisionConfiguration: Record<string, unknown>, decisionEdges = [
  { id: "decision-true", source: "decision-1", target: "notify-true" },
  { id: "decision-false", source: "decision-1", target: "notify-false" },
]) {
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
        id: "decision-1",
        type: "decision.condition",
        label: "Decidir prioridade",
        position: { x: 180, y: 0 },
        configuration: decisionConfiguration,
      },
      {
        id: "notify-true",
        type: "notification.simulate",
        label: "Caminho verdadeiro",
        position: { x: 360, y: -80 },
        configuration: { channel: "painel_interno", messageTemplate: "Verdadeiro" },
      },
      {
        id: "notify-false",
        type: "notification.simulate",
        label: "Caminho falso",
        position: { x: 360, y: 80 },
        configuration: { channel: "painel_interno", messageTemplate: "Falso" },
      },
    ],
    edges: [
      { id: "trigger-decision", source: "trigger-1", target: "decision-1" },
      ...decisionEdges,
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

const validConfiguration = {
  condition: {
    field: "input.priority",
    operator: "eq",
    value: "alta",
  },
  trueTargetNodeId: "notify-true",
  falseTargetNodeId: "notify-false",
};

describe("D-012G G2 — validação de decision.condition", () => {
  it("aceita na publicação uma decisão com expressão G1 válida e dois destinos explícitos", () => {
    const report = validateWorkflowDefinition(definition(validConfiguration), { forPublication: true });
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("falha fechado quando a expressão não atende ao contrato G1", () => {
    const report = validateWorkflowDefinition(definition({
      ...validConfiguration,
      condition: { field: "input.priority", operator: "eval", value: "alta" },
    }), { forPublication: true });

    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toMatch(/condi|operador|inválid/i);
  });

  it("exige destinos verdadeiro e falso explícitos e distintos", () => {
    const missing = validateWorkflowDefinition(definition({
      condition: validConfiguration.condition,
      trueTargetNodeId: "notify-true",
    }), { forPublication: true });
    expect(missing.valid).toBe(false);
    expect(missing.errors.join(" ")).toMatch(/falso|falseTarget/i);

    const same = validateWorkflowDefinition(definition({
      ...validConfiguration,
      falseTargetNodeId: "notify-true",
    }), { forPublication: true });
    expect(same.valid).toBe(false);
    expect(same.errors.join(" ")).toMatch(/distint|destino/i);
  });

  it("exige exatamente duas saídas correspondentes aos destinos declarados", () => {
    const missingEdge = validateWorkflowDefinition(
      definition(validConfiguration, [
        { id: "decision-true", source: "decision-1", target: "notify-true" },
      ]),
      { forPublication: true },
    );
    expect(missingEdge.valid).toBe(false);
    expect(missingEdge.errors.join(" ")).toMatch(/duas|saída|destino/i);

    const mismatched = validateWorkflowDefinition(
      definition(validConfiguration, [
        { id: "decision-true", source: "decision-1", target: "notify-true" },
        { id: "decision-wrong", source: "decision-1", target: "trigger-1" },
      ]),
      { forPublication: true },
    );
    expect(mismatched.valid).toBe(false);
    expect(mismatched.errors.join(" ")).toMatch(/destino|saída|verdadeiro|falso/i);
  });

  it("mantém a validação G2 sem executar a condição", () => {
    const report = validateWorkflowDefinition(definition({
      ...validConfiguration,
      condition: { field: "secret.token", operator: "eq", value: "x" },
    }), { forPublication: true });

    // G2 valida estrutura; a autorização de campos é aplicada no runtime G3/G4.
    expect(report.valid).toBe(true);
  });
});
