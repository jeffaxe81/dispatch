import { describe, expect, it } from "vitest";
import { toWorkflowInstanceGraph } from "./workflowInstancePersistence";

const validSla = {
  dueInMinutes: 60,
  reminderBeforeMinutes: 15,
  escalationAfterMinutes: 30,
  escalationMode: "notify_only",
} as const;

function definition() {
  return {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger.manual",
        configuration: { inputLabel: "Entrada" },
      },
      {
        id: "human-1",
        type: "notification.simulate",
        configuration: {
          channel: "painel_interno",
          messageTemplate: "Revisar",
          requiresHumanTask: true,
          assigneeUserId: 11,
          sla: { ...validSla },
        },
      },
      {
        id: "end-1",
        type: "notification.simulate",
        configuration: {
          channel: "painel_interno",
          messageTemplate: "Fim",
        },
      },
    ],
    edges: [
      { id: "trigger-human", source: "trigger-1", target: "human-1" },
      { id: "human-end", source: "human-1", target: "end-1" },
    ],
  };
}

describe("D-012I I3-B — congelamento e timestamps SLA", () => {
  it("congela a configuração SLA no grafo da versão", () => {
    const source = definition();
    const graph = toWorkflowInstanceGraph(source);

    expect(graph.nodes[1]).toMatchObject({
      id: "human-1",
      requiresHumanTask: true,
      slaConfiguration: validSla,
    });

    (source.nodes[1].configuration.sla as { dueInMinutes: number }).dueInMinutes = 5;
    expect((graph.nodes[1] as unknown as { slaConfiguration: typeof validSla }).slaConfiguration.dueInMinutes).toBe(60);
  });

  it("deriva timestamps persistíveis uma única vez a partir do occurredAt", async () => {
    const module = await import("./workflowTaskPersistence");
    const build = (module as unknown as {
      buildWorkflowTaskSlaPersistenceValues?: (
        configuration: unknown,
        occurredAt: string,
      ) => {
        slaStartedAt: Date | null;
        slaReminderAt: Date | null;
        slaDueAt: Date | null;
        slaEscalationAt: Date | null;
      };
    }).buildWorkflowTaskSlaPersistenceValues;

    expect(typeof build).toBe("function");
    const values = build!(validSla, "2026-09-27T14:00:00.000Z");

    expect(values.slaStartedAt?.toISOString()).toBe("2026-09-27T14:00:00.000Z");
    expect(values.slaReminderAt?.toISOString()).toBe("2026-09-27T14:45:00.000Z");
    expect(values.slaDueAt?.toISOString()).toBe("2026-09-27T15:00:00.000Z");
    expect(values.slaEscalationAt?.toISOString()).toBe("2026-09-27T15:30:00.000Z");
  });

  it("mantém timestamps nulos quando a tarefa não possui SLA", async () => {
    const module = await import("./workflowTaskPersistence");
    const build = (module as unknown as {
      buildWorkflowTaskSlaPersistenceValues?: (
        configuration: unknown,
        occurredAt: string,
      ) => Record<string, Date | null>;
    }).buildWorkflowTaskSlaPersistenceValues;

    expect(typeof build).toBe("function");
    expect(build!(null, "2026-09-27T14:00:00.000Z")).toEqual({
      slaStartedAt: null,
      slaReminderAt: null,
      slaDueAt: null,
      slaEscalationAt: null,
    });
  });
});
