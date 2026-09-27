import { readFileSync } from "node:fs";
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
    }, "event:incident.created.v1");

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


  it("resolve decisão usando somente o inputData congelado e preserva correlationId", async () => {
    const { resolveWorkflowDecisionFromExecutionInput } = await loadModule();

    const result = resolveWorkflowDecisionFromExecutionInput({
      state: {
        workflowId: 9,
        workflowVersionId: 901,
        currentNodeId: "decision-priority",
        status: "running",
      },
      graph: {
        nodes: [
          {
            id: "decision-priority",
            type: "decision.condition",
            decision: {
              condition: {
                field: "input.priority",
                operator: "eq",
                value: "alta",
              },
              trueTargetNodeId: "notify-high",
              falseTargetNodeId: "notify-normal",
            },
          },
          { id: "notify-high", type: "notification.simulate" },
          { id: "notify-normal", type: "notification.simulate" },
        ],
        edges: [
          { source: "decision-priority", target: "notify-high" },
          { source: "decision-priority", target: "notify-normal" },
        ],
      },
      inputData: { simulation: true, priority: "alta" },
      triggerType: "manual",
      actorUserId: 7,
      correlationId: "corr-g4-0001",
      occurredAt: "2026-09-27T10:30:00.000Z",
    });

    expect(result.state.currentNodeId).toBe("notify-high");
    expect(result.transition.correlationId).toBe("corr-g4-0001");
  });

  it("falha fechado para inputData inválido em vez de consultar domínio externo", async () => {
    const { buildWorkflowDecisionContextFromExecutionInput } = await loadModule();

    expect(() => buildWorkflowDecisionContextFromExecutionInput(null, "manual")).toThrow(/inputData/i);
    expect(() => buildWorkflowDecisionContextFromExecutionInput(["invalid"], "manual")).toThrow(/inputData/i);
  });
  it("não interpreta campos manuais reservados como metadados de evento", async () => {
    const { buildWorkflowDecisionContextFromExecutionInput } = await loadModule();

    const context = buildWorkflowDecisionContextFromExecutionInput({
      simulation: true,
      eventId: "manual-value",
      payload: { arbitrary: true },
      priority: "alta",
    }, "manual");

    expect(context.fields).toEqual({
      "input.eventId": "manual-value",
      "input.payload": { arbitrary: true },
      "input.priority": "alta",
    });
    expect(context.exposedFields.has("meta.eventId")).toBe(false);
    expect(context.exposedFields.has("event.arbitrary")).toBe(false);
  });

  it("falha fechado para triggerType desconhecido e payload de evento inválido", async () => {
    const { buildWorkflowDecisionContextFromExecutionInput } = await loadModule();

    expect(() => buildWorkflowDecisionContextFromExecutionInput(
      { simulation: true },
      "scheduler",
    )).toThrow(/triggerType|gatilho/i);

    expect(() => buildWorkflowDecisionContextFromExecutionInput(
      {
        simulation: true,
        eventId: "evt-1",
        eventType: "incident.created.v1",
        producer: "axe-dispatch",
        payload: ["invalid"],
      },
      "event:incident.created.v1",
    )).toThrow(/payload/i);
  });

  it("limita a quantidade de campos expostos no contexto persistido", async () => {
    const {
      buildWorkflowDecisionContextFromExecutionInput,
      MAX_WORKFLOW_DECISION_CONTEXT_FIELDS,
    } = await loadModule();

    const oversized = Object.fromEntries(
      Array.from({ length: MAX_WORKFLOW_DECISION_CONTEXT_FIELDS + 1 }, (_, index) => [
        `field${index}`,
        index,
      ]),
    );

    expect(() => buildWorkflowDecisionContextFromExecutionInput(
      { simulation: true, ...oversized },
      "manual",
    )).toThrow(/limite|campos/i);
  });

  it("mantém o contexto de decisão desacoplado dos domínios produtores", () => {
    const source = readFileSync(new URL("./workflowDecisionPersistence.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/from\s+["'][^"']*forms\//);
    expect(source).not.toMatch(/from\s+["'][^"']*assetInventory/);
    expect(source).not.toMatch(/from\s+["'][^"']*incident(?:s|Lifecycle|Evidence)?/);
    expect(source).not.toContain("dbLegacy");
  });

});
