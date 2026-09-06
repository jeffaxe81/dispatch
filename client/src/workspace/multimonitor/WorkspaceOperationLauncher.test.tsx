import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceScreen } from "@shared/workspaceLayout";
import { WorkspaceOperationLauncher } from "./WorkspaceOperationLauncher";

const screens: WorkspaceScreen[] = [
  { screenId: "primary", name: "Central", order: 0, mode: "primary", widgets: [] },
  { screenId: "map", name: "Mapa", order: 1, mode: "external", widgets: [] },
];

describe("WorkspaceOperationLauncher", () => {
  it("usa o MultiMonitorManager com rota same-origin e mantém a janela para foco posterior", () => {
    const managedWindow = { closed: false, focus: vi.fn(), close: vi.fn() };
    const openWindow = vi.fn(() => managedWindow);

    render(
      <WorkspaceOperationLauncher
        screens={screens}
        openWindow={openWindow}
        origin="https://dispatch.local"
        workspaceName="default"
      />,
    );

    const button = screen.getByRole("button", { name: "Abrir configuração de operação" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledWith(
      "https://dispatch.local/workspace/external?workspace=default&screen=map",
      "workspace-screen-map",
    );
    expect(managedWindow.focus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("1 focada");
  });
});
