import { describe, expect, it } from "vitest";

const modulePath = "./workflowDecisionPersistence";
const loadModule = () => import(modulePath);

describe("D-012G G4 workflow decision persistence context", () => {
  it("expõe somente input, event payload e metadados namespaced da própria execução", async () => {
    const { buildWorkflowDecisionContextFromExecutionInput } = await loadModule();

    const context = buildWorkflowDecisionContextFromExecutionInput({
      simulation: true,
      priority: "alta",
      customerId: 77,
      eventId: "evt-100",
      eventType: "incident.created.v1",
      producer: "axe-dispatch",
      payload: {
        severity: 4,
        status: "aberta",
      },
    });

    expect(context.fields).toEqual({
      "input.priority": "alta",
      "input.customerId": 77,
      "event.severity": 4,
      "event.status": "aberta",
      "meta.eventId": "evt-100",
      "meta.eventType": "incident.created.v1",
      "meta.producer": "axe-dispatch",
    });
    expect([...context.exposedFields].sort()).toEqual(Object.keys(context.fields).sort());
    expect(context.exposedFields.has("simulation")).toBe(false);
    expect(context.exposedFields.has("payload")).toBe(false);
  });

  it("falha fechado para inputData inválido em vez de consultar domínio externo", async () => {
    const { buildWorkflowDecisionContextFromExecutionInput } = await loadModule();

    expect(() => buildWorkflowDecisionContextFromExecutionInput(null)).toThrow(/inputData/i);
    expect(() => buildWorkflowDecisionContextFromExecutionInput(["invalid"])).toThrow(/inputData/i);
  });
});
