// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflowSlaOperational: {
      metrics: {
        useQuery: vi.fn(() => ({
          isLoading: false, error: null,
          data: {
            pending: 125, leased: 2, deadLetter: 1, expiredLeases: 0,
            waitingRetries: 0, overdue: 8, maxLagMinutes: 34,
            generatedAt: "2026-10-22T19:00:00.000Z",
          },
        })),
      },
      diagnostic: {
        useQuery: vi.fn(() => ({
          isLoading: false,
          error: null,
          data: {
            status: "disabled",
            organizationId: 9,
            evaluatedAt: "2026-10-22T19:00:00.000Z",
            components: { scheduler: "unknown", adapter: "unknown" },
            backlog: null,
            reasons: ["feature_disabled"],
          },
        })),
      },
      list: {
        useQuery: vi.fn(() => ({
          isLoading: false,
          error: null,
          data: [{
            intentId: 11,
            taskId: 21,
            organizationId: 9,
            eventKind: "reminder",
            deliveryStatus: "pending",
            taskStatus: "open",
            assigneeUserId: 77,
            scheduledAt: "2026-10-21T20:15:00.000Z",
            correlationId: "corr-11",
            attempts: 0,
            minutesFromNow: 15,
            timing: "future",
          }],
        })),
      },
    },
  },
}));

import { SlaAlertsWidget } from "./SlaAlertsWidget";

describe("D-012J SlaAlertsWidget runtime", () => {
  it("consome o read model SLA do Workflow em vez da idade da ocorrência", () => {
    render(<SlaAlertsWidget widget={{ id: "sla", type: "sla_alerts", title: "SLA", settings: {} } as never} />);
    expect(screen.getByText(/tarefa #21/i)).toBeTruthy();
    expect(screen.getByText(/lembrete/i)).toBeTruthy();
    expect(screen.getByText(/em 15 min/i)).toBeTruthy();
    expect(screen.getByText(/prontidão não habilitada/i)).toBeTruthy();
    expect(screen.getByText(/recorte filtrado/i)).toBeTruthy();
    expect(screen.getByText(/totais operacionais por empresa/i)).toBeTruthy();
    expect(screen.getByText("125")).toBeTruthy();
  });
});
