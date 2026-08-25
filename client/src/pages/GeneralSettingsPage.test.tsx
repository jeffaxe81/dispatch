import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetMutation: vi.fn(),
  invalidate: vi.fn(),
  setLocation: vi.fn(),
  mapSettings: { centerLatitude: -27.0976, centerLongitude: -48.9104, defaultZoom: 13, mapType: "roadmap", trafficEnabled: false, autoFitEnabled: true, fallbackMode: "automatic" },
  resetPreview: { totalRecords: 4, impact: { occurrences: 2, users: 1, teams: 1 }, preserved: ["auditoria"], evidenceStorageNote: "Referências removidas." },
}));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/QueryState", () => ({ QueryState: () => null }));
vi.mock("wouter", () => ({ useLocation: () => ["/administracao/configuracoes", mocks.setLocation] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      settings: { generalMap: { invalidate: mocks.invalidate }, operationalMap: { invalidate: mocks.invalidate }, resetPreview: { invalidate: mocks.invalidate } },
      dashboard: { summary: { invalidate: mocks.invalidate } },
      incidents: { invalidate: mocks.invalidate },
      teams: { invalidate: mocks.invalidate },
      workflows: { invalidate: mocks.invalidate },
      integrations: { invalidate: mocks.invalidate },
      audit: { operations: { invalidate: mocks.invalidate } },
    }),
    access: { me: { useQuery: () => ({ data: { isSuperAdministrator: true }, isLoading: false, error: null }) } },
    settings: {
      generalMap: { useQuery: () => ({ data: mocks.mapSettings, isLoading: false, error: null }) },
      futureEntries: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
      resetPreview: { useQuery: () => ({ data: mocks.resetPreview, isLoading: false, error: null }) },
      updateGeneralMap: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      resetOperationalData: { useMutation: () => ({ mutate: mocks.resetMutation, isPending: false, error: null }) },
    },
  },
}));

import GeneralSettingsPage from "./GeneralSettingsPage";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { value: () => false },
  setPointerCapture: { value: () => undefined },
  releasePointerCapture: { value: () => undefined },
  scrollIntoView: { value: () => undefined },
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("GeneralSettingsPage — reinicialização controlada", () => {
  it("exige a confirmação do escopo operacional antes de enviar a mutation", async () => {
    const user = userEvent.setup();
    render(<GeneralSettingsPage />);

    await user.click(screen.getByRole("button", { name: /reinicializar dados operacionais/i }));
    const action = screen.getByRole("button", { name: /zerar dados operacionais previstos/i });
    expect(action).toHaveProperty("disabled", true);
    await user.type(screen.getByLabelText(/confirmação textual/i), "ZERAR DADOS OPERACIONAIS");
    await user.type(screen.getByLabelText(/motivo para auditoria/i), "Preparar o ambiente para um novo ciclo.");
    await user.click(action);

    expect(mocks.resetMutation).toHaveBeenCalledWith({ scope: "operational", confirmation: "ZERAR DADOS OPERACIONAIS", reason: "Preparar o ambiente para um novo ciclo." });
  });

  it("altera o aviso e a confirmação exigida quando o escopo total é escolhido", async () => {
    const user = userEvent.setup();
    render(<GeneralSettingsPage />);

    await user.click(screen.getByRole("combobox", { name: /escopo da reinicialização/i }));
    await user.click(screen.getByRole("option", { name: /dados totais da solução/i }));

    expect(screen.getByText(/além dos dados operacionais, remove usuários cadastrados/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /reinicializar dados totais/i })).toBeTruthy();
  });
});
