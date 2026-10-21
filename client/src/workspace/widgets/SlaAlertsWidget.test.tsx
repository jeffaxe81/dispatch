// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlaAlertsWidgetView } from "./SlaAlertsWidget";

describe("D-012J SlaAlertsWidget", () => {
  it("renderiza prazo e estado reais do Workflow SLA", () => {
    render(<SlaAlertsWidgetView rows={[{
      intentId: 11,
      taskId: 21,
      eventKind: "overdue",
      deliveryStatus: "dead_letter",
      taskStatus: "in_progress",
      assigneeUserId: 77,
      scheduledAt: "2026-10-21T19:45:00.000Z",
      attempts: 3,
      minutesFromNow: -15,
      timing: "due",
    }]} />);
    expect(screen.getByText(/tarefa #21 · vencimento/i)).toBeTruthy();
    expect(screen.getByText(/quarentena/i)).toBeTruthy();
    expect(screen.getByText(/15 min vencido/i)).toBeTruthy();
  });

  it("mostra estado vazio seguro sem eventos SLA operacionais", () => {
    render(<SlaAlertsWidgetView rows={[]} />);
    expect(screen.getByText(/nenhum alerta SLA operacional/i)).toBeTruthy();
  });
});
