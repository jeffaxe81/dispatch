import { describe, expect, it } from "vitest";
import { buildSimulatedExecutionPlan, validateWorkflowDefinition } from "./db";

const definition = {
  nodes: [
    { id: "trigger-1", type: "trigger.manual", label: "Gatilho", position: { x: 0, y: 0 }, configuration: { mode: "simulacao", inputLabel: "entrada_manual" } },
    { id: "notification-1", type: "notification.simulate", label: "Aviso", position: { x: 180, y: 0 }, configuration: { mode: "simulacao", channel: "painel_interno", messageTemplate: "Alerta" } },
  ],
  edges: [{ id: "edge-1", source: "trigger-1", target: "notification-1" }],
  metadata: { mode: "simulacao", definitionVersion: 1 },
};

describe("executor de workflows em simulação", () => {
  it("conclui cada etapa sem realizar chamada externa", () => {
    const plan = buildSimulatedExecutionPlan(definition, { simulation: true }, 1, 3);
    expect(plan.finalStatus).toBe("concluida");
    expect(plan.outputData).toMatchObject({ simulation: true, externalRequests: 0, nodesProcessed: 2 });
    expect(plan.steps).toEqual([expect.objectContaining({ nodeId: "trigger-1", status: "concluida" }), expect.objectContaining({ nodeId: "notification-1", status: "concluida" })]);
  });

  it("segue a direção do grafo mesmo quando a ordem visual dos nós é diferente", () => {
    const reversedVisualOrder = { ...definition, nodes: [definition.nodes[1], definition.nodes[0]] };
    const plan = buildSimulatedExecutionPlan(reversedVisualOrder, { simulation: true }, 1, 3);

    expect(plan.steps.map(step => step.nodeId)).toEqual(["trigger-1", "notification-1"]);
  });

  it("impede publicar ou executar uma conexão apontada para o gatilho", () => {
    const reversedConnection = { ...definition, edges: [{ id: "edge-1", source: "notification-1", target: "trigger-1" }] };
    const report = validateWorkflowDefinition(reversedConnection, { forPublication: true });

    expect(report.valid).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      'O gatilho "Gatilho" não pode receber conexões de entrada.',
      'O gatilho "Gatilho" precisa iniciar ao menos uma conexão.',
      'O nó "Aviso" precisa receber uma conexão de entrada.',
    ]));
  });

  it("direciona falhas controladas para retry e dead-letter no limite de tentativas", () => {
    const retryable = buildSimulatedExecutionPlan(definition, { simulateFailure: true }, 1, 3);
    const deadLetter = buildSimulatedExecutionPlan(definition, { simulateFailure: true }, 3, 3);
    expect(retryable).toMatchObject({ finalStatus: "falha", errorData: { code: "SIMULATION_FAILURE", retryable: true } });
    expect(deadLetter).toMatchObject({ finalStatus: "dead_letter", errorData: { code: "SIMULATION_FAILURE", retryable: false } });
    expect(deadLetter.steps.at(-1)).toMatchObject({ status: "dead_letter" });
  });

  it("preserva a mesma execução para que as tentativas acumuladas possam atingir a dead-letter", () => {
    const firstAttempt = buildSimulatedExecutionPlan(definition, { simulateFailure: true }, 1, 3);
    const secondAttempt = buildSimulatedExecutionPlan(definition, { simulateFailure: true }, 2, 3);
    const thirdAttempt = buildSimulatedExecutionPlan(definition, { simulateFailure: true }, 3, 3);
    expect([firstAttempt.finalStatus, secondAttempt.finalStatus, thirdAttempt.finalStatus]).toEqual(["falha", "falha", "dead_letter"]);
  });
});
