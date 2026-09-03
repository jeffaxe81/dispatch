// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { NEO_INTERACT_EMBEDDED_APPLICATION } from "@shared/embeddedApplications";
import { NeoOperationalWorkspace } from "./NeoOperationalWorkspace";

const incident = {
  code: "OC-2026-127",
  category: "Iluminação pública",
  priorityLabel: "Alta",
  statusLabel: "Aguardando despacho",
  address: "Rua de homologação, 100",
  requesterName: "Solicitante de teste",
  requesterContact: "(00) 00000-0000",
  description: "Poste sem iluminação no cenário controlado.",
};

describe("NeoOperationalWorkspace", () => {
  it("mantém contexto da ocorrência ao lado da aplicação incorporada", () => {
    render(
      <NeoOperationalWorkspace
        open
        onOpenChange={() => undefined}
        application={NEO_INTERACT_EMBEDDED_APPLICATION}
        incident={incident}
        teamCode="EQ-01"
        vehiclePrefix="VTR-07"
      />,
    );

    expect(screen.getByText("Ocorrência + NEO Interact")).toBeTruthy();
    expect(screen.getByText("OC-2026-127")).toBeTruthy();
    expect(screen.getByText("Iluminação pública")).toBeTruthy();
    expect(screen.getByText("EQ-01")).toBeTruthy();
    expect(screen.getByTitle("NEO Interact").getAttribute("src"))
      .toBe("https://gscprj.saas.digitro.cloud/neo/");
  });

  it("explicita que dados da ocorrência não são enviados automaticamente ao iframe", () => {
    render(
      <NeoOperationalWorkspace
        open
        onOpenChange={() => undefined}
        application={NEO_INTERACT_EMBEDDED_APPLICATION}
        incident={incident}
      />,
    );

    expect(screen.getByText(/nenhum dado da ocorrência é enviado automaticamente ao iframe/i)).toBeTruthy();
  });

  it("mostra fallback seguro quando a aplicação não está disponível", () => {
    render(
      <NeoOperationalWorkspace
        open
        onOpenChange={() => undefined}
        application={null}
        incident={incident}
      />,
    );

    expect(screen.getByRole("status").textContent)
      .toContain("NEO Interact não está disponível");
    expect(screen.queryByTitle("NEO Interact")).toBeNull();
  });
});
