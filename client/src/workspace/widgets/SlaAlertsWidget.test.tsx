// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlaAlertsWidgetView } from "./SlaAlertsWidget";

describe("D-010C SlaAlertsWidget", () => {
  it("renders incidents at or above configured risk threshold", () => {
    render(<SlaAlertsWidgetView rows={[{ id: 42, code: "OC-42", category: "Alagamento", priority: "critica", ageMinutes: 35 }]} riskMinutes={15} />);
    expect(screen.getByText(/OC-42 · critica/i)).toBeTruthy();
    expect(screen.getByText(/35 min/i)).toBeTruthy();
  });

  it("shows safe empty state when nothing is at risk", () => {
    render(<SlaAlertsWidgetView rows={[]} riskMinutes={15} />);
    expect(screen.getByText(/nenhum alerta/i)).toBeTruthy();
  });
});
