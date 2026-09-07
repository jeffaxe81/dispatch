import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceScreen } from "@shared/workspaceLayout";
import { OpenOperationLayoutButton } from "./OpenOperationLayoutButton";

const screens: WorkspaceScreen[] = [
  { screenId: "primary", name: "Central", order: 0, mode: "primary", widgets: [] },
  { screenId: "map", name: "Mapa", order: 1, mode: "external", widgets: [] },
  { screenId: "neo", name: "Comunicação", order: 2, mode: "external", widgets: [] },
];

describe("OpenOperationLayoutButton", () => {
  it("abre todas as superfícies externas em uma única ação e resume o resultado", () => {
    const openAllExternal = vi.fn(() => [
      { screenId: "map", status: "opened" as const },
      { screenId: "neo", status: "focused" as const },
    ]);

    render(<OpenOperationLayoutButton screens={screens} openAllExternal={openAllExternal} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir configuração de operação" }));

    expect(openAllExternal).toHaveBeenCalledTimes(1);
    expect(openAllExternal).toHaveBeenCalledWith(screens);
    expect(screen.getByRole("status").textContent).toContain("1 aberta");
    expect(screen.getByRole("status").textContent).toContain("1 focada");
  });

  it("informa bloqueios de popup sem tratar como sucesso", () => {
    const openAllExternal = vi.fn(() => [
      { screenId: "map", status: "opened" as const },
      { screenId: "neo", status: "blocked" as const },
    ]);

    render(<OpenOperationLayoutButton screens={screens} openAllExternal={openAllExternal} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir configuração de operação" }));

    expect(screen.getByRole("alert").textContent).toContain("1 bloqueada");
    expect(screen.getByRole("alert").textContent).toContain("pop-up");
  });

  it("desabilita quando não há superfícies externas configuradas", () => {
    const openAllExternal = vi.fn(() => []);
    render(<OpenOperationLayoutButton screens={[screens[0]]} openAllExternal={openAllExternal} />);

    const button = screen.getByRole("button", { name: "Abrir configuração de operação" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
