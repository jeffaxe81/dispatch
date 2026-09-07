// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KanbanWidgetView } from "./KanbanWidget";

describe("D-010C KanbanWidget", () => {
  it("renders incidents and selects one", () => {
    const onSelect = vi.fn();
    render(<KanbanWidgetView rows={[{ id: 42, code: "OC-42", category: "Alagamento", status: "em_atendimento", priority: "critica" }]} onSelectIncident={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /OC-42/i }));
    expect(screen.getByText("Alagamento")).toBeTruthy();
    expect(onSelect).toHaveBeenCalledWith(42);
  });

  it("shows safe empty state", () => {
    render(<KanbanWidgetView rows={[]} onSelectIncident={() => undefined} />);
    expect(screen.getByText(/nenhuma ocorrência/i)).toBeTruthy();
  });
});
