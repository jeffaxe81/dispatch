import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ importSpec: vi.fn(), generate: vi.fn(), testSimulation: vi.fn(), refetch: vi.fn(), invalidate: vi.fn() }));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/QueryState", () => ({ QueryState: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ integrations: { openapi: { specs: { invalidate: mocks.invalidate }, spec: { invalidate: mocks.invalidate }, }, connections: { list: { invalidate: mocks.invalidate } } } }),
    integrations: { openapi: {
      internal: { useQuery: () => ({ data: { openapi: "3.1.0", paths: { "/integracoes/eventos": { get: { summary: "Listar eventos", tags: ["Integrations"], "x-simulation-only": true } } } }, isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) },
      specs: { useQuery: () => ({ data: [{ spec: { id: 9, name: "Frota Municipal", apiVersion: "v1", openapiVersion: "3.1.0", operationCount: 1 } }], isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) },
      spec: { useQuery: () => ({ data: { operations: [{ id: 27, method: "GET", path: "/vehicles", summary: "Listar viaturas", operationKey: "listVehicles", tags: ["Vehicles"], generatedConnectionId: null }] }, isLoading: false, error: null }) },
      import: { useMutation: () => ({ mutate: mocks.importSpec, isPending: false, error: null }) },
      generateConnector: { useMutation: () => ({ mutate: mocks.generate, isPending: false }) },
      testSimulation: { useMutation: () => ({ mutate: mocks.testSimulation, isPending: false }) },
    } },
  },
}));

import ApiDocsPage from "./ApiDocsPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ApiDocsPage", () => {
  it("mostra o catálogo interno e importa uma especificação somente para simulação", async () => {
    const user = userEvent.setup();
    render(<ApiDocsPage />);

    expect(screen.getByText(/catálogo interno openapi 3.1/i)).toBeTruthy();
    expect(screen.getByText(/não disponibiliza REST público/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/conteúdo da especificação/i), { target: { value: '{"openapi":"3.1.0"}' } });
    await user.click(screen.getByRole("button", { name: /analisar e importar/i }));
    expect(mocks.importSpec).toHaveBeenCalledWith({ document: '{"openapi":"3.1.0"}', format: "auto" });
  });

  it("permite testar e gerar somente o conector simulado da operação selecionada", async () => {
    const user = userEvent.setup();
    render(<ApiDocsPage />);

    await user.click(screen.getByText("Frota Municipal"));
    await user.click(screen.getByRole("button", { name: "Testar" }));
    await user.click(screen.getByRole("button", { name: /gerar conector/i }));
    expect(mocks.testSimulation).toHaveBeenCalledWith({ operationId: 27 });
    expect(mocks.generate).toHaveBeenCalledWith({ operationId: 27 });
  });
});
