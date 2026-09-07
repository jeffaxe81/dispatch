import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  migrateWorkspaceV1ToV2,
  type WorkspaceLayout,
  type WorkspaceLayoutV2,
  type WorkspaceScreen,
} from "@shared/workspaceLayout";
import { WorkspaceCanvas } from "../WorkspaceCanvas";
import { WorkspaceScreenTabs } from "./WorkspaceScreenTabs";

function syntheticScreens(count: number): WorkspaceScreen[] {
  return Array.from({ length: count }, (_, index) => ({
    screenId: index === 0 ? "primary" : `screen-${index + 1}`,
    name: index === 0 ? "Central" : `Superfície ${index + 1}`,
    order: index,
    mode: index === 0 ? "primary" as const : "external" as const,
    widgets: index === 0
      ? [{ instanceId: "metrics-1", type: "metrics" as const, x: 0, y: 0, w: 6, h: 4, settings: {} }]
      : [],
  }));
}

describe("D-010B multiscreen integration", () => {
  it("preserva a experiência single-screen do D-010A após migrar um layout v1", () => {
    const legacy: WorkspaceLayout = {
      id: "workspace-default",
      name: "default",
      version: 1,
      widgets: [
        { instanceId: "metrics-1", type: "metrics", x: 0, y: 0, w: 4, h: 2, settings: {} },
        { instanceId: "map-1", type: "operational-map", x: 4, y: 0, w: 8, h: 6, settings: {} },
      ],
    };

    const migrated = migrateWorkspaceV1ToV2(legacy);
    render(<WorkspaceCanvas layout={migrated} activeScreenId="primary" onSelectScreen={vi.fn()} />);

    expect(migrated.screens).toHaveLength(1);
    expect(migrated.screens[0].mode).toBe("primary");
    expect(screen.getByText("Indicadores")).toBeTruthy();
    expect(screen.getByText("Mapa operacional")).toBeTruthy();
  });

  it("renderiza pelo menos 12 superfícies sem abrir janelas reais", () => {
    const openSpy = vi.spyOn(window, "open");
    const layout: WorkspaceLayoutV2 = {
      id: "workspace-many",
      name: "default",
      version: 2,
      screens: syntheticScreens(12),
    };

    render(<WorkspaceCanvas layout={layout} activeScreenId="primary" onSelectScreen={vi.fn()} />);

    expect(screen.getAllByRole("tab")).toHaveLength(12);
    expect(screen.getByRole("tab", { name: /Superfície 12/ })).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("navega pelas superfícies com setas do teclado e mantém foco no tab selecionado", () => {
    const screens = syntheticScreens(3);
    const onSelect = vi.fn();
    render(<WorkspaceScreenTabs screens={screens} activeScreenId="primary" onSelect={onSelect} />);

    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });

    expect(onSelect).toHaveBeenCalledWith("screen-2");
    expect(document.activeElement).toBe(tabs[1]);
  });
});
