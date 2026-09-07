// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResourcesWidgetView } from "./ResourcesWidget";

describe("D-010C ResourcesWidget", () => {
  it("renders teams and linked vehicles", () => {
    render(<ResourcesWidgetView rows={[{ id: 7, code: "VTR-07", name: "Equipe Centro", status: "disponivel", vehiclePrefix: "CAR-07", vehicleType: "SUV" }]} includeVehicles />);
    expect(screen.getByText("Equipe Centro")).toBeTruthy();
    expect(screen.getByText(/CAR-07/)).toBeTruthy();
  });

  it("shows safe empty state", () => {
    render(<ResourcesWidgetView rows={[]} includeVehicles />);
    expect(screen.getByText(/nenhum recurso/i)).toBeTruthy();
  });
});
