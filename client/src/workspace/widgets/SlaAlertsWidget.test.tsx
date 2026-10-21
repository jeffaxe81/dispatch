// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { filterSlaOperationalRows, slaOperationalSeverity, SlaAlertsWidgetView, type SlaAlertRow } from "./SlaAlertsWidget";

const base: SlaAlertRow = {
  intentId: 11,
  taskId: 21,
  eventKind: "overdue",
  deliveryStatus: "pending",
  taskStatus: "in_progress",
  assigneeUserId: 77,
  scheduledAt: "2026-10-21T19:45:00.000Z",
  attempts: 1,
  minutesFromNow: -15,
  timing: "due",
};

describe("D-012J J2 SlaAlertsWidget", () => {
  it("classifica semáforo por quarentena, vencimento e proximidade", () => {
    expect(slaOperationalSeverity({ ...base, deliveryStatus: "dead_letter" })).toBe("quarantine");
    expect(slaOperationalSeverity({ ...base, eventKind: "escalation" })).toBe("critical");
    expect(slaOperationalSeverity({ ...base, eventKind: "reminder" })).toBe("attention");
    expect(slaOperationalSeverity({ ...base, timing: "future", minutesFromNow: 10 })).toBe("attention");
    expect(slaOperationalSeverity({ ...base, timing: "future", minutesFromNow: 45 })).toBe("normal");
  });

  it("filtra evento, estado de entrega, tarefa e responsável sem ampliar escopo", () => {
    const rows: SlaAlertRow[] = [
      base,
      { ...base, intentId: 12, taskId: 22, eventKind: "reminder", deliveryStatus: "leased", assigneeUserId: null },
    ];
    expect(filterSlaOperationalRows(rows, { eventKinds: ["reminder"] }).map(row => row.intentId)).toEqual([12]);
    expect(filterSlaOperationalRows(rows, { deliveryStatuses: ["pending"] }).map(row => row.intentId)).toEqual([11]);
    expect(filterSlaOperationalRows(rows, { taskId: 22 }).map(row => row.intentId)).toEqual([12]);
    expect(filterSlaOperationalRows(rows, { assigneeUserId: 77 }).map(row => row.intentId)).toEqual([11]);
  });

  it("renderiza prazo, estado e semáforo reais do Workflow SLA", () => {
    render(<SlaAlertsWidgetView rows={[{ ...base, deliveryStatus: "dead_letter", attempts: 3 }]} />);
    expect(screen.getByText(/tarefa #21 · vencimento/i)).toBeTruthy();
    expect(screen.getByText(/quarentena/i)).toBeTruthy();
    expect(screen.getByText(/15 min vencido/i)).toBeTruthy();
    expect(screen.getByLabelText(/severidade quarentena/i)).toBeTruthy();
  });

  it("mostra estado vazio seguro sem eventos SLA operacionais", () => {
    render(<SlaAlertsWidgetView rows={[]} />);
    expect(screen.getByText(/nenhum alerta SLA operacional/i)).toBeTruthy();
  });
});
