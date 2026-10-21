import { describe, expect, it, vi } from "vitest";
import { createWorkflowSlaOperationalReadModel, type WorkflowSlaOperationalReadStore } from "./workflowSlaOperationalReadModel";

function store(): WorkflowSlaOperationalReadStore {
  return {
    list: vi.fn(async () => [
      {
        intentId: 11,
        taskId: 21,
        organizationId: 9,
        eventKind: "reminder" as const,
        deliveryStatus: "pending" as const,
        taskStatus: "open" as const,
        assigneeUserId: 77,
        scheduledAt: "2026-10-21T20:15:00.000Z",
        correlationId: "corr-11",
        attempts: 0,
      },
      {
        intentId: 12,
        taskId: 22,
        organizationId: 9,
        eventKind: "overdue" as const,
        deliveryStatus: "dead_letter" as const,
        taskStatus: "in_progress" as const,
        assigneeUserId: null,
        scheduledAt: "2026-10-21T19:45:00.000Z",
        correlationId: "corr-12",
        attempts: 3,
      },
    ]),
  };
}

describe("D-012J — SLA operational read model", () => {
  it("calcula tempo pelo relógio do servidor e preserva dados SLA reais", async () => {
    const persistence = store();
    const result = await createWorkflowSlaOperationalReadModel(persistence).list({
      organizationId: 9,
      limit: 20,
      now: "2026-10-21T20:00:00.000Z",
    });

    expect(persistence.list).toHaveBeenCalledWith({
      organizationId: 9,
      limit: 20,
      now: "2026-10-21T20:00:00.000Z",
    });
    expect(result).toEqual([
      expect.objectContaining({ intentId: 11, eventKind: "reminder", minutesFromNow: 15, timing: "future" }),
      expect.objectContaining({ intentId: 12, deliveryStatus: "dead_letter", minutesFromNow: -15, timing: "due" }),
    ]);
  });

  it("falha fechado para tenant, limite ou relógio inválidos antes da persistência", async () => {
    const persistence = store();
    const service = createWorkflowSlaOperationalReadModel(persistence);
    await expect(service.list({ organizationId: 0, now: "2026-10-21T20:00:00.000Z" })).rejects.toThrow(/organization/i);
    await expect(service.list({ organizationId: 9, limit: 101, now: "2026-10-21T20:00:00.000Z" })).rejects.toThrow(/limite/i);
    await expect(service.list({ organizationId: 9, now: "2026-10-21 20:00:00" })).rejects.toThrow(/UTC/i);
    expect(persistence.list).not.toHaveBeenCalled();
  });

  it("rejeita linhas fora do tenant ou com estado não operacional", async () => {
    const persistence = store();
    persistence.list = vi.fn(async () => [{
      intentId: 13,
      taskId: 23,
      organizationId: 10,
      eventKind: "overdue",
      deliveryStatus: "pending",
      taskStatus: "open",
      assigneeUserId: null,
      scheduledAt: "2026-10-21T19:00:00.000Z",
      correlationId: "corr-13",
      attempts: 0,
    }]);
    await expect(createWorkflowSlaOperationalReadModel(persistence).list({
      organizationId: 9,
      now: "2026-10-21T20:00:00.000Z",
    })).rejects.toThrow(/tenant|escopo/i);
  });
});
