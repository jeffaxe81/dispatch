// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationalTimelineWidgetView } from "./OperationalTimelineWidget";

describe("D-010C OperationalTimelineWidget", () => {
  it("renders selected incident timeline events", () => {
    render(<OperationalTimelineWidgetView events={[{ id: 1, message: "Equipe despachada", createdAt: new Date("2026-09-06T12:00:00Z"), actorName: "Operador", teamCode: "VTR-01" }]} />);
    expect(screen.getByText("Equipe despachada")).toBeTruthy();
    expect(screen.getByText(/VTR-01/)).toBeTruthy();
  });

  it("shows safe empty state without events", () => {
    render(<OperationalTimelineWidgetView events={[]} />);
    expect(screen.getByText(/nenhum evento/i)).toBeTruthy();
  });
});
