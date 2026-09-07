// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IncidentDetailWidgetView } from "./IncidentDetailWidget";

describe("D-010C IncidentDetailWidget", () => {
  it("renders authorized selected incident details", () => {
    render(<IncidentDetailWidgetView incident={{ code: "OC-42", category: "Alagamento", status: "em_atendimento", priority: "critica", address: "Rua A", description: "Via bloqueada" }} teamCode="VTR-01" vehiclePrefix="V-10" />);
    expect(screen.getByText("OC-42")).toBeTruthy();
    expect(screen.getByText("Rua A")).toBeTruthy();
    expect(screen.getByText("VTR-01")).toBeTruthy();
  });

  it("shows safe empty state when no incident is selected", () => {
    render(<IncidentDetailWidgetView incident={null} />);
    expect(screen.getByText(/selecione uma ocorrência/i)).toBeTruthy();
  });
});
