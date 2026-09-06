import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLayoutV2 } from "@shared/workspaceLayout";
import { WorkspaceCanvas } from "./WorkspaceCanvas";

const layout: WorkspaceLayoutV2 = {
  id: "workspace-default",
  name: "default",
  version: 2,
  screens: [
    {
      screenId: "primary",
      name: "Central",
      order: 0,
      mode: "primary",
      widgets: [{ instanceId: "metrics-1", type: "metrics", x: 0, y: 0, w: 6, h: 4, settings: {} }],
    },
    {
      screenId: "map",
      name: "Mapa",
      order: 1,
      mode: "external",
      widgets: [{ instanceId: "map-1", type: "operational-map", x: 0, y: 0, w: 12, h: 8, settings: {} }],
    },
  ],
};

describe("WorkspaceCanvas", () => {
  it("renderiza somente a superfície ativa usando o catálogo seguro", () => {
    render(<WorkspaceCanvas layout={layout} activeScreenId="map" onSelectScreen={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Mapa" })).toBeTruthy();
    expect(screen.getByText("Mapa operacional")).toBeTruthy();
    expect(screen.queryByText("Indicadores")).toBeNull();
  });

  it("faz fallback para a primeira superfície válida quando a ativa não existe", () => {
    render(<WorkspaceCanvas layout={layout} activeScreenId="missing" onSelectScreen={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Central" })).toBeTruthy();
    expect(screen.getByText("Indicadores")).toBeTruthy();
  });

  it("troca a superfície pela aba sem mutar o layout", () => {
    const onSelect = vi.fn();
    render(<WorkspaceCanvas layout={layout} activeScreenId="primary" onSelectScreen={onSelect} />);
    fireEvent.click(screen.getByRole("tab", { name: /Mapa/ }));
    expect(onSelect).toHaveBeenCalledWith("map");
    expect(layout.screens[0].mode).toBe("primary");
  });
});
