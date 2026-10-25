import { describe, expect, it } from "vitest";
import { buildWorkflowSlaOperationalTrace } from "./workflowSlaOperationalTrace";

describe("D-012J J4 — correlation trace", () => {
  it("agrupa a trilha por correlationId sem expor dados sensíveis", () => {
    const trace = buildWorkflowSlaOperationalTrace([
      {
        intentId: 11,
        taskId: 21,
        organizationId: 9,
        eventKind: "reminder",
        deliveryStatus: "pending",
        taskStatus: "open",
        assigneeUserId: 77,
        scheduledAt: "2026-10-22T12:00:00.000Z",
        correlationId: "corr-21",
        attempts: 0,
        notificationBody: "segredo",
        destination: "+5547999999999",
        deliveryToken: "token-secreto",
        lastError: "stack sensível",
      },
      {
        intentId: 12,
        taskId: 21,
        organizationId: 9,
        eventKind: "overdue",
        deliveryStatus: "leased",
        taskStatus: "open",
        assigneeUserId: 77,
        scheduledAt: "2026-10-22T12:30:00.000Z",
        correlationId: "corr-21",
        attempts: 1,
      },
      {
        intentId: 13,
        taskId: 22,
        organizationId: 9,
        eventKind: "escalation",
        deliveryStatus: "dead_letter",
        taskStatus: "in_progress",
        assigneeUserId: null,
        scheduledAt: "2026-10-22T11:00:00.000Z",
        correlationId: "corr-22",
        attempts: 3,
      },
    ] as any);

    expect(trace).toEqual([
      {
        correlationId: "corr-21",
        organizationId: 9,
        intentIds: [11, 12],
        taskIds: [21],
        eventKinds: ["reminder", "overdue"],
        deliveryStatuses: ["pending", "leased"],
        totalAttempts: 1,
        firstScheduledAt: "2026-10-22T12:00:00.000Z",
        lastScheduledAt: "2026-10-22T12:30:00.000Z",
        diagnosticCode: "in_flight",
      },
      {
        correlationId: "corr-22",
        organizationId: 9,
        intentIds: [13],
        taskIds: [22],
        eventKinds: ["escalation"],
        deliveryStatuses: ["dead_letter"],
        totalAttempts: 3,
        firstScheduledAt: "2026-10-22T11:00:00.000Z",
        lastScheduledAt: "2026-10-22T11:00:00.000Z",
        diagnosticCode: "quarantine",
      },
    ]);

    const serialized = JSON.stringify(trace);
    expect(serialized).not.toMatch(/segredo|destination|deliveryToken|lastError|stack|99999999/i);
  });

  it("usa diagnóstico pending quando a correlação não tem lease nem quarentena", () => {
    expect(buildWorkflowSlaOperationalTrace([
      {
        intentId: 20,
        taskId: 30,
        organizationId: 9,
        eventKind: "reminder",
        deliveryStatus: "pending",
        taskStatus: "open",
        assigneeUserId: null,
        scheduledAt: "2026-10-22T10:00:00.000Z",
        correlationId: "corr-pending",
        attempts: 0,
      },
    ] as any)[0]?.diagnosticCode).toBe("pending");
  });

  it("falha fechado para tenant misto, correlação inválida ou linha inválida", () => {
    expect(() => buildWorkflowSlaOperationalTrace([
      {
        intentId: 1,
        taskId: 1,
        organizationId: 9,
        eventKind: "reminder",
        deliveryStatus: "pending",
        taskStatus: "open",
        assigneeUserId: null,
        scheduledAt: "2026-10-22T10:00:00.000Z",
        correlationId: "corr-x",
        attempts: 0,
      },
      {
        intentId: 2,
        taskId: 2,
        organizationId: 10,
        eventKind: "overdue",
        deliveryStatus: "pending",
        taskStatus: "open",
        assigneeUserId: null,
        scheduledAt: "2026-10-22T10:05:00.000Z",
        correlationId: "corr-x",
        attempts: 0,
      },
    ] as any)).toThrow(/tenant|organiza/i);

    expect(() => buildWorkflowSlaOperationalTrace([
      {
        intentId: 1,
        taskId: 1,
        organizationId: 9,
        eventKind: "reminder",
        deliveryStatus: "pending",
        taskStatus: "open",
        assigneeUserId: null,
        scheduledAt: "invalid",
        correlationId: " corr ",
        attempts: -1,
      },
    ] as any)).toThrow();
  });
});
