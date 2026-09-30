import { describe, expect, it } from "vitest";
import { validateWorkflowDefinition } from "../dbLegacy";

const validSla = {
  dueInMinutes: 60,
  reminderBeforeMinutes: 15,
  escalationAfterMinutes: 30,
  escalationMode: "notify_only",
} as const;

function definition(humanConfiguration: Record<string, unknown>) {
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
        id: "human-1",
        type: "notification.simulate",
        label: "Revisar",
        position: { x: 180, y: 0 },
        configuration: humanConfiguration,
      },
      {
        id: "end-1",
        type: "notification.simulate",
        label: "Fim",
        position: { x: 360, y: 0 },
        configuration: {
          channel: "painel_interno",
          messageTemplate: "Concluído",
        },
      },
    ],
    edges: [
      { id: "trigger-human", source: "trigger-1", target: "human-1" },
      { id: "human-end", source: "human-1", target: "end-1" },
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

function humanNode(sla: unknown = validSla) {
  return {
    channel: "painel_interno",
    messageTemplate: "Revisar atendimento",
    requiresHumanTask: true,
    assigneeUserId: 11,
    sla,
  };
}

describe("D-012I I2 — validação SLA na definição", () => {
  it("aceita SLA válido somente em etapa explicitamente humana", () => {
    const report = validateWorkflowDefinition(definition(humanNode()), { forPublication: true });
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("mantém etapa humana sem SLA compatível com versões anteriores", () => {
    const configuration = humanNode();
    delete (configuration as Record<string, unknown>).sla;

    const report = validateWorkflowDefinition(definition(configuration), { forPublication: true });
    expect(report.valid).toBe(true);
  });

  it("rejeita SLA inválido mesmo quando a etapa é humana", () => {
    const report = validateWorkflowDefinition(definition(humanNode({
      ...validSla,
      reminderBeforeMinutes: 60,
    })), { forPublication: true });

    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toMatch(/SLA|prazo|lembrete|válid/i);
  });

  it("rejeita SLA em nó que não é tarefa humana", () => {
    const report = validateWorkflowDefinition(definition({
      channel: "painel_interno",
      messageTemplate: "Automático",
      sla: validSla,
    }), { forPublication: true });

    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toMatch(/SLA|tarefa humana|requiresHumanTask/i);
  });

  it("rejeita SLA em trigger mesmo que alguém tente marcar requiresHumanTask", () => {
    const value = definition(humanNode());
    value.nodes[0].configuration = {
      inputLabel: "Entrada",
      requiresHumanTask: true,
      sla: validSla,
    };

    const report = validateWorkflowDefinition(value, { forPublication: true });
    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toMatch(/SLA|trigger|gatilho|tarefa humana/i);
  });
});
