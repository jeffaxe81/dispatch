// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NEO_INTERACT_EMBEDDED_APPLICATION } from "@shared/embeddedApplications";
import { NeoOperationalWorkspace } from "./NeoOperationalWorkspace";

afterEach(() => cleanup());

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

  it("permite alternar entre modos operacionais sem perder a ocorrência", () => {
    render(
      <NeoOperationalWorkspace
        open
        onOpenChange={() => undefined}
        application={NEO_INTERACT_EMBEDDED_APPLICATION}
        incident={incident}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /foco neo/i }));
    expect(screen.getByText("OC-2026-127")).toBeTruthy();
    expect(screen.getByTitle("NEO Interact")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /dock inferior/i }));
    expect(screen.getByText("Iluminação pública")).toBeTruthy();
    expect(screen.getByTitle("NEO Interact")).toBeTruthy();
  });

  it("oferece abertura segura em segundo monitor usando o destino homologado", () => {
    render(
      <NeoOperationalWorkspace
        open
        onOpenChange={() => undefined}
        application={NEO_INTERACT_EMBEDDED_APPLICATION}
        incident={incident}
      />,
    );

    const link = screen.getByRole("link", { name: /segundo monitor/i });
    expect(link.getAttribute("href")).toBe("https://gscprj.saas.digitro.cloud/neo/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
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
    expect(screen.queryByRole("link", { name: /segundo monitor/i })).toBeNull();
  });
});
