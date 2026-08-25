// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { QueryState } from "./QueryState";

describe("QueryState renderizado", () => {
  it("apresenta carregamento com status acessível", () => {
    render(<QueryState loading label="ocorrências" />);
    expect(screen.getByRole("status").textContent).toContain("Carregando ocorrências");
  });

  it("apresenta erro recuperável com mensagem contextual", () => {
    render(<QueryState label="equipes" error={{ message: "Serviço temporariamente indisponível." }} />);
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível atualizar equipes");
    expect(screen.getByRole("alert").textContent).toContain("temporariamente indisponível");
  });

  it("não ocupa espaço quando não existe estado transitório", () => {
    const { container } = render(<QueryState label="relatórios" />);
    expect(container.innerHTML).toBe("");
  });
});
