// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FormDesignerPage } from "./FormDesignerPage";

vi.mock("wouter", () => ({ useLocation: () => ["/formularios/3", vi.fn()] }));

describe("D-008 designer version state", () => {
  it("ressincroniza a definição quando a versão carregada muda", () => {
    const base = { formId: 3, code: "VISTORIA", name: "Vistoria", versionId: 5, version: 1, status: "published" as const, definition: { schemaVersion: 1 as const, title: "Versão 1", fields: [] } };
    const { rerender } = render(<FormDesignerPage initial={base} />);
    expect(screen.getByRole("heading", { name: "Versão 1" })).toBeTruthy();
    rerender(<FormDesignerPage initial={{ ...base, versionId: 6, version: 2, status: "draft", definition: { schemaVersion: 1, title: "Versão 2", fields: [] } }} />);
    expect(screen.getByRole("heading", { name: "Versão 2" })).toBeTruthy();
  });
});