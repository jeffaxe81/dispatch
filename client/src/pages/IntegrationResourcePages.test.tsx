import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateConnection: vi.fn(), activateAlrt: vi.fn(), approveAlrt: vi.fn(), createCredential: vi.fn(), invalidate: vi.fn(), refetch: vi.fn() }));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/QueryState", () => ({ QueryState: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ integrations: { connections: { list: { invalidate: mocks.invalidate } }, webhooks: { list: { invalidate: mocks.invalidate } }, credentials: { list: { invalidate: mocks.invalidate } } } }),
    integrations: {
      connections: {
        list: { useQuery: () => ({ data: [{ id: 17, code: "despacho-alrt-homologacao", name: "Despacho ALRT — Eventos", connectionType: "http_simulado", baseUrl: "https://api.exemplo.gov.br", description: "Referência", active: false, configuration: {} }], isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) },
        create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
        activateAlrtHomologation: { useMutation: () => ({ mutate: mocks.activateAlrt, isPending: false, error: null }) },
        approveAlrtProductionReadiness: { useMutation: () => ({ mutate: mocks.approveAlrt, isPending: false, error: null }) },
        update: { useMutation: () => ({ mutate: mocks.updateConnection, isPending: false, error: null }) },
        delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      },
      webhooks: { list: { useQuery: () => ({ data: [], isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) }, create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
      credentials: { list: { useQuery: () => ({ data: [], isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) }, create: { useMutation: () => ({ mutate: mocks.createCredential, isPending: false, error: null }) }, delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
      logs: { useQuery: () => ({ data: [], isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) },
      ingressTestLog: { useQuery: () => ({ data: [{ id: 1, level: "erro", source: "alrt.ingress.teste", message: "Teste de recepção ALRT rejeitado: INVALID_API_KEY.", requestData: { source: "despacho-alrt", correlationId: "corr-123", eventType: null }, responseData: { result: "rejected", automaticEffects: false }, httpStatus: 401, errorCode: "INVALID_API_KEY", createdAt: new Date("2026-08-22T14:01:00.000Z") }], isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) },
    },
  },
}));

import { ConnectionsPage, CredentialsPage, IntegrationLogsPage } from "./IntegrationResourcePages";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("IntegrationResourcePages", () => {
  it("edita uma conexão de referência sem efetuar chamada externa", async () => {
    const user = userEvent.setup();
    render(<ConnectionsPage />);

    expect(screen.getByText("SIMULAÇÃO / MOCK")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByText("Editar conexão simulada")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));
    expect(mocks.updateConnection).toHaveBeenCalledWith({ connectionId: 17, code: "despacho-alrt-homologacao", name: "Despacho ALRT — Eventos", connectionType: "http_simulado", baseUrl: "https://api.exemplo.gov.br", description: "Referência" });
  });

  it("oferece a reativação da referência ALRT sem acionar entrega HTTP", async () => {
    const user = userEvent.setup();
    render(<ConnectionsPage />);

    await user.click(screen.getByRole("button", { name: /reativar conexão alrt/i }));
    expect(mocks.activateAlrt).toHaveBeenCalledWith();
  });

  it("permite registrar apenas a pré-aprovação administrativa, sem liberar entrega externa", async () => {
    const user = userEvent.setup();
    render(<ConnectionsPage />);

    await user.click(screen.getByRole("button", { name: /pré-aprovar produção/i }));
    expect(mocks.approveAlrt).toHaveBeenCalledWith();
    expect(screen.getByText(/nenhum tráfego externo será liberado/i)).toBeTruthy();
  });

  it("apresenta somente placeholders no cofre, sem campo para segredo real", async () => {
    const user = userEvent.setup();
    render(<CredentialsPage />);

    expect(screen.getByText(/sem entrada de segredo/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /novo placeholder/i }));
    expect(screen.getByText(/não informe qualquer segredo/i)).toBeTruthy();
    expect(screen.queryByLabelText(/senha|token|valor do segredo/i)).toBeNull();
  });

  it("mostra o log de testes de recebimento externo com correlação e diagnóstico seguro", () => {
    render(<IntegrationLogsPage />);

    expect(screen.getByText("Log de teste de recebimento externo")).toBeTruthy();
    expect(screen.getByText("corr-123")).toBeTruthy();
    expect(screen.getByText("INVALID_API_KEY")).toBeTruthy();
    expect(screen.getByText("Efeitos automáticos:")).toBeTruthy();
  });
});
