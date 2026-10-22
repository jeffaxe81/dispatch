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

  it("exibe totais globais do tenant separados da amostra de uma linha", () => {
    render(<SlaSupervisionSummary
      rows={[base]} limit={1}
      diagnostic={{ status: "disabled" }}
      metrics={{
        pending: 125, leased: 2, deadLetter: 1, expiredLeases: 0,
        waitingRetries: 0, overdue: 8, maxLagMinutes: 34,
        generatedAt: "2026-10-22T19:00:00.000Z",
      }}
    />);
    expect(screen.getByText(/recorte filtrado: 1 registro/i)).toBeTruthy();
    expect(screen.getByText("125")).toBeTruthy();
    expect(screen.getByText(/agregação completa das intenções/i)).toBeTruthy();
    expect(screen.getByText(/prontidão não habilitada/i)).toBeTruthy();
  });

  it("não apresenta zeros enganosos quando o agregado falha ou retorna números inválidos", () => {
    const { rerender } = render(
      <SlaSupervisionSummary rows={[base]} limit={10} diagnostic={{ status: "disabled" }}
        metrics={null} metricsError />,
    );
    expect(screen.getByText(/totais operacionais indisponíveis/i)).toBeTruthy();
    rerender(<SlaSupervisionSummary rows={[base]} limit={10}
      diagnostic={{ status: "disabled" }} metrics={null} metricsLoading />);
    expect(screen.getByText(/calculando totais operacionais/i)).toBeTruthy();
    rerender(<SlaSupervisionSummary rows={[base]} limit={10}
      diagnostic={{ status: "disabled" }}
      metrics={{
        pending: -1, leased: 0, deadLetter: 0, expiredLeases: 0,
        waitingRetries: 0, overdue: 0, maxLagMinutes: 0,
        generatedAt: "2026-10-22T19:00:00.000Z",
      }} />);
    expect(screen.getByText(/totais operacionais indisponíveis/i)).toBeTruthy();
  });

  it("mostra razões de falta de evidência sem revelar payload arbitrário", () => {
    render(<SlaSupervisionSummary
      rows={[]} limit={20}
      diagnostic={{
        status: "not_ready",
        components: { scheduler: "unknown", adapter: "unknown" },
        reasons: ["scheduler_unavailable", "adapter_unavailable", "secret-token"],
      }}
    />);
    expect(screen.getByText(/evidências da prontidão/i)).toBeTruthy();
    expect(screen.getByText(/scheduler sem evidência de disponibilidade/i)).toBeTruthy();
    expect(screen.getByText(/adapter de entrega sem evidência/i)).toBeTruthy();
    expect(screen.getByText(/não constitui aprovação de produção/i)).toBeTruthy();
    expect(screen.queryByText(/secret-token/i)).toBeNull();
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
