// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceWidgetFrame } from "./WorkspaceWidgetFrame";

describe("D-010C WorkspaceWidgetFrame", () => {
  it("renders a sanitized local error without stack details", () => {
    render(<WorkspaceWidgetFrame title="Mapa" state="error" error={new Error("db password=secret\nstack trace")} />);
    expect(screen.getByRole("heading", { name: "Mapa" })).toBeTruthy();
    expect(screen.getByText("Conteúdo temporariamente indisponível.")).toBeTruthy();
    expect(screen.queryByText(/password/i)).toBeNull();
    expect(screen.queryByText(/stack/i)).toBeNull();
  });

  it("supports loading, empty, unavailable and forbidden states", () => {
    const { rerender } = render(<WorkspaceWidgetFrame title="Teste" state="loading" />);
    expect(screen.getByText("Carregando…")).toBeTruthy();
    rerender(<WorkspaceWidgetFrame title="Teste" state="empty" />);
    expect(screen.getByText("Nenhum dado disponível.")).toBeTruthy();
    rerender(<WorkspaceWidgetFrame title="Teste" state="unavailable" />);
    expect(screen.getByText("Conteúdo indisponível.")).toBeTruthy();
    rerender(<WorkspaceWidgetFrame title="Teste" state="forbidden" />);
    expect(screen.getByText("Acesso não autorizado.")).toBeTruthy();
  });
});
