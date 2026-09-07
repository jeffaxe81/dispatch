import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceScreen } from "@shared/workspaceLayout";
import { WorkspaceScreenTabs } from "./WorkspaceScreenTabs";

const screens: WorkspaceScreen[] = [
  { screenId: "primary", name: "Central", order: 0, mode: "primary", widgets: [] },
  { screenId: "map", name: "Mapa", order: 1, mode: "external", widgets: [] },
  { screenId: "neo", name: "Comunicação", order: 2, mode: "external", widgets: [] },
];

describe("WorkspaceScreenTabs", () => {
  it("ordena superfícies e identifica a principal", () => {
    render(<WorkspaceScreenTabs screens={[screens[2], screens[0], screens[1]]} activeScreenId="primary" onSelect={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map(tab => tab.textContent)).toEqual(["CentralPrincipal", "MapaExterna", "ComunicaçãoExterna"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });

  it("seleciona uma superfície sem alterar o layout", () => {
    const onSelect = vi.fn();
    render(<WorkspaceScreenTabs screens={screens} activeScreenId="primary" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("tab", { name: /Mapa/ }));
    expect(onSelect).toHaveBeenCalledWith("map");
    expect(screens[0].mode).toBe("primary");
  });

  it("usa a primeira superfície válida quando a ativa não existe", () => {
    render(<WorkspaceScreenTabs screens={screens} activeScreenId="missing" onSelect={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /Central/ }).getAttribute("aria-selected")).toBe("true");
  });
});
