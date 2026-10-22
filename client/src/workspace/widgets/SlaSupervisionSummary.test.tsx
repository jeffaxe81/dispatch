// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listAllowedWorkspaceWidgets } from "../widgetRegistry";
import { SlaSupervisionSummary, summarizeSlaVisibleRows } from "./SlaSupervisionSummary";
import type { SlaAlertRow } from "./SlaAlertsWidget";

const base: SlaAlertRow = {
  intentId: 11, taskId: 21, eventKind: "overdue",
  deliveryStatus: "pending", taskStatus: "open", assigneeUserId: 5,
  scheduledAt: "2026-10-22T19:00:00.000Z",
  attempts: 0, minutesFromNow: -10, timing: "due",
};

describe("D-012J J6 — supervisão SLA sem inferência de saúde", () => {
  it("exibe apenas contadores do recorte filtrado, com limite explícito", () => {
    const rows: SlaAlertRow[] = [
      base,
      { ...base, intentId: 12, deliveryStatus: "leased", timing: "future" },
      { ...base, intentId: 13, deliveryStatus: "dead_letter" },
    ];
    expect(summarizeSlaVisibleRows(rows)).toEqual({
      returned: 3, pending: 1, leased: 1, quarantine: 1, due: 2,
    });
    render(<SlaSupervisionSummary rows={rows} limit={50} diagnostic={{ status: "disabled" }} />);
    expect(screen.getByText(/recorte filtrado: 3 registro/i)).toBeTruthy();
    expect(screen.getByText(/não representam o total/i)).toBeTruthy();
    expect(screen.getByText(/prontidão não habilitada/i)).toBeTruthy();
  });

  it("não anuncia prontidão quando consulta falha, carrega ou retorna estado inválido", () => {
    const { rerender } = render(
      <SlaSupervisionSummary rows={[]} limit={20} diagnostic={null} diagnosticLoading />,
    );
    expect(screen.getByText(/consultando diagnóstico/i)).toBeTruthy();
    rerender(<SlaSupervisionSummary rows={[]} limit={20} diagnostic={null} diagnosticError />);
    expect(screen.getByText(/diagnóstico de prontidão indisponível/i)).toBeTruthy();
    rerender(<SlaSupervisionSummary rows={[]} limit={20} diagnostic={{ status: "invalid" } as never} />);
    expect(screen.getByText(/diagnóstico de prontidão indisponível/i)).toBeTruthy();
    expect(screen.queryByText(/prontidão diagnóstica: pronta/i)).toBeNull();
  });

  it("mantém o widget restrito à permissão exigida pela API", () => {
    const allowed = new Set(["occurrences.view"]);
    expect(listAllowedWorkspaceWidgets(allowed).some(widget => widget.type === "sla-alerts")).toBe(false);
    allowed.add("workflow_tasks.view");
    expect(listAllowedWorkspaceWidgets(allowed).some(widget => widget.type === "sla-alerts")).toBe(true);
  });

  it("só exibe status positivo quando fornecido explicitamente pelo diagnóstico", () => {
    const { rerender } = render(
      <SlaSupervisionSummary rows={[]} limit={5} diagnostic={{ status: "ready" }} />,
    );
    expect(screen.getByText(/prontidão diagnóstica: pronta \(homologação\)/i)).toBeTruthy();
    rerender(<SlaSupervisionSummary rows={[]} limit={5} diagnostic={{ status: "not_ready" }} />);
    expect(screen.getByText(/não pronta \(homologação\)/i)).toBeTruthy();
  });
});
