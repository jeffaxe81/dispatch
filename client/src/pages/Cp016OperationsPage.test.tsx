// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Cp016OperationsView } from "./Cp016OperationsPage";

const team = {
  code: "VTR-21",
  name: "Patrulha Centro",
  shiftStatus: "open" as const,
  presenceStatus: "available" as const,
  availableForDispatch: true,
  startedAt: new Date("2026-09-03T10:00:00Z"),
  pausedAt: null,
  totalPauseSeconds: 600,
};

const integration = {
  code: "neo-interact",
  name: "NEO Interact",
  url: "https://gscprj.saas.digitro.cloud/neo/",
  enabled: true,
  displayMode: "split" as const,
};

describe("Cp016OperationsView", () => {
  it("exibe jornada e presença operacional da equipe", () => {
    render(<Cp016OperationsView team={team} integration={integration} onShiftAction={vi.fn()} />);
    expect(screen.getByText("VTR-21")).toBeTruthy();
    expect(screen.getByText("Jornada em andamento")).toBeTruthy();
    expect(screen.getByText("Disponível para despacho")).toBeTruthy();
  });

  it("renderiza o NEO em iframe HTTPS quando a integração está habilitada", () => {
    render(<Cp016OperationsView team={team} integration={integration} onShiftAction={vi.fn()} />);
    const iframe = screen.getByTitle("NEO Interact");
    expect(iframe.getAttribute("src")).toBe("https://gscprj.saas.digitro.cloud/neo/");
  });

  it("aciona a pausa da jornada pelo painel operacional", () => {
    const onShiftAction = vi.fn();
    render(<Cp016OperationsView team={team} integration={integration} onShiftAction={onShiftAction} />);
    fireEvent.click(screen.getByRole("button", { name: /pausar jornada/i }));
    expect(onShiftAction).toHaveBeenCalledWith("pause");
  });

  it("mostra estado seguro quando o NEO está desabilitado", () => {
    render(<Cp016OperationsView team={team} integration={{ ...integration, enabled: false }} onShiftAction={vi.fn()} />);
    expect(screen.getByText(/integração NEO está desabilitada/i)).toBeTruthy();
    expect(screen.queryByTitle("NEO Interact")).toBeNull();
  });
});
