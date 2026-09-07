// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceScreen } from "@shared/workspaceLayout";

vi.mock("./widgetRendererRegistry", async () => {
  const ReactModule = await import("react");
  return {
    getWorkspaceWidgetRenderer: (type: string) => {
      if (type === "kanban") return () => ReactModule.createElement("div", null, "Conteúdo Kanban real");
      if (type === "incident-detail") return () => { throw new Error("segredo interno que não pode vazar"); };
      return null;
    },
  };
});

import { WorkspaceScreenCanvas } from "./WorkspaceScreenCanvas";

function makeScreen(mode: "primary" | "external", widgets: WorkspaceScreen["widgets"]): WorkspaceScreen {
  return { screenId: mode === "primary" ? "primary" : "screen-2", name: mode === "primary" ? "Principal" : "Monitor 2", order: mode === "primary" ? 0 : 1, mode, widgets };
}

const kanban = { instanceId: "kanban-1", type: "kanban" as const, x: 0, y: 0, w: 6, h: 4, settings: {} };
const broken = { instanceId: "detail-1", type: "incident-detail" as const, x: 6, y: 0, w: 6, h: 4, settings: {} };

describe("D-010C WorkspaceScreenCanvas", () => {
  it("monta o renderer funcional em vez do placeholder de título", () => {
    render(<WorkspaceScreenCanvas screen={makeScreen("primary", [kanban])} />);
    expect(screen.getByText("Conteúdo Kanban real")).toBeTruthy();
  });

  it("isola falha de um renderer e mantém o widget irmão visível", () => {
    render(<WorkspaceScreenCanvas screen={makeScreen("primary", [kanban, broken])} />);
    expect(screen.getByText("Conteúdo Kanban real")).toBeTruthy();
    expect(screen.getByText("Conteúdo temporariamente indisponível.")).toBeTruthy();
    expect(screen.queryByText(/segredo interno/i)).toBeNull();
  });

  it("monta o mesmo renderer em superfície externa", () => {
    render(<WorkspaceScreenCanvas screen={makeScreen("external", [kanban])} />);
    expect(screen.getByText("Conteúdo Kanban real")).toBeTruthy();
  });
});
