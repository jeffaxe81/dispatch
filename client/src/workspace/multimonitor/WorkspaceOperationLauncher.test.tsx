import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("adapta getScreenDetails para posicionamento progressivo sem expor identificador físico", async () => {
    const managedWindow = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
      moveTo: vi.fn(),
      resizeTo: vi.fn(),
    };
    const openWindow = vi.fn(() => managedWindow);
    const getScreenDetails = vi.fn(async () => ({
      screens: [
        { label: "Monitor Leste", left: 1920, top: 0, width: 2560, height: 1440, internalId: "must-not-leak" },
      ],
    }));

    render(
      <WorkspaceOperationLauncher
        screens={[
          screens[0],
          { ...screens[1], preferredDisplay: { label: "Monitor Leste" } },
        ]}
        openWindow={openWindow}
        origin="https://dispatch.local"
        workspaceName="default"
        getScreenDetails={getScreenDetails}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir configuração de operação" }));

    await waitFor(() => expect(managedWindow.moveTo).toHaveBeenCalledWith(1920, 0));
    expect(managedWindow.resizeTo).toHaveBeenCalledWith(2560, 1440);
    expect(getScreenDetails).toHaveBeenCalledTimes(1);
  });
});
