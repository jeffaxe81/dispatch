import { describe, expect, it } from "vitest";
import { summarizeWorkflowSlaOperationalMetrics } from "./workflowSlaOperationalMetrics";

describe("D-012J J3 — SLA operational metrics", () => {
  it("agrega backlog, DLQ, lease expirado, retry e maior lag sem payload sensível", () => {
    const now = "2026-10-21T21:00:00.000Z";
    expect(summarizeWorkflowSlaOperationalMetrics([
      {
        status: "pending",
        scheduledAt: "2026-10-21T20:50:00.000Z",
        leaseExpiresAtMs: null,
        nextAttemptAtMs: Date.parse("2026-10-21T21:05:00.000Z"),
      },
      {
        status: "leased",
        scheduledAt: "2026-10-21T20:30:00.000Z",
        leaseExpiresAtMs: Date.parse("2026-10-21T20:59:00.000Z"),
        nextAttemptAtMs: null,
      },
      {
        status: "dead_letter",
        scheduledAt: "2026-10-21T20:00:00.000Z",
        leaseExpiresAtMs: null,
        nextAttemptAtMs: null,
      },
      {
        status: "pending",
        scheduledAt: "2026-10-21T21:15:00.000Z",
        leaseExpiresAtMs: null,
        nextAttemptAtMs: null,
      },
    ], now)).toEqual({
      pending: 2,
      leased: 1,
      deadLetter: 1,
      expiredLeases: 1,
      waitingRetries: 1,
      overdue: 3,
      maxLagMinutes: 60,
      generatedAt: now,
    });
  });

  it("retorna zeros para fila vazia", () => {
    expect(summarizeWorkflowSlaOperationalMetrics([], "2026-10-21T21:00:00.000Z")).toEqual({
      pending: 0,
      leased: 0,
      deadLetter: 0,
      expiredLeases: 0,
      waitingRetries: 0,
      overdue: 0,
      maxLagMinutes: 0,
      generatedAt: "2026-10-21T21:00:00.000Z",
    });
  });

  it("falha fechado para relógio ou linha inválida", () => {
    expect(() => summarizeWorkflowSlaOperationalMetrics([], "2026-10-21 21:00:00")).toThrow(/UTC/i);
    expect(() => summarizeWorkflowSlaOperationalMetrics([{
      status: "leased",
      scheduledAt: "invalid",
      leaseExpiresAtMs: null,
      nextAttemptAtMs: null,
    }], "2026-10-21T21:00:00.000Z")).toThrow(/scheduledAt/i);
  });
});
