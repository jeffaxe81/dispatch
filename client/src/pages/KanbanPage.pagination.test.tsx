import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listQueries: [] as Array<{ status: string; page: number; pageSize: number; enabled: boolean }>,
  invalidations: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/QueryState", () => ({ QueryState: () => null }));
vi.mock("@/components/RefreshControls", () => ({ RefreshControls: () => <button>Atualizar quadro</button> }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { operationalRole: "despachador", active: true } }) }));
vi.mock("@/hooks/useRefreshSettings", () => ({ useRefreshSettings: () => ({ interval: false, setInterval: vi.fn() }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/kanban", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      incidents: { list: { invalidate: mocks.invalidations } },
      dashboard: { summary: { invalidate: mocks.invalidations } },
    }),
    teams: { list: { useQuery: () => ({ data: [], isError: false }) } },
    tenant: { selection: { useQuery: () => ({ data: { activeOrganizationId: 1 }, isLoading: false }) } },
    incidents: {
      list: {
        useQuery: (input: { status: string; page: number; pageSize: number }, options: { enabled: boolean }) => {
          mocks.listQueries.push({ ...input, enabled: options.enabled });
          const total = input.status === "triagem" ? 25 : 4;
          const count = input.status === "triagem" ? (input.page === 1 ? 20 : 5) : 4;
          const rows = Array.from({ length: count }, (_, n) => ({
            incident: {
              id: (input.page - 1) * 20 + n + 1,
              code: input.status + "-" + input.page + "-" + n,
              category: "Teste " + input.status,
              priority: "alta", status: input.status,
              createdAt: "2026-10-31T12:00:00Z",
            },
            teamCode: null,
          }));
          return { data: { rows, total }, isLoading: false, isFetching: false, isError: false, error: null };
        },
      },
      transition: { useMutation: () => ({ mutate: mocks.mutation }) },
    },
  },
}));

import KanbanPage from "./KanbanPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.listQueries.length = 0; });

describe("AXED-F018 - paginação independente por coluna", () => {
  it("emite sete consultas filtradas por situação com página própria e contagem integral", () => {
    render(<KanbanPage />);
    const first = new Set(mocks.listQueries.map(x => x.status));
    expect(first.size).toBe(7);
    expect(mocks.listQueries.every(x => x.page === 1 && x.pageSize === 20 && x.enabled)).toBe(true);
    expect(within(screen.getByLabelText("Coluna Em triagem")).getByText("25 no total")).toBeTruthy();
    expect(within(screen.getByLabelText("Coluna Despachada")).getByText("4 no total")).toBeTruthy();
  });

  it("navega na segunda página de triagem sem alterar a página das outras seis etapas", () => {
    render(<KanbanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Próxima página de Em triagem" }));
    expect(mocks.listQueries.some(x => x.status === "triagem" && x.page === 2)).toBe(true);
    expect(mocks.listQueries.filter(x => x.status !== "triagem").every(x => x.page === 1)).toBe(true);
    const firstColumn = screen.getByLabelText("Coluna Em triagem");
    expect(within(firstColumn).getByText("Página 2/2")).toBeTruthy();
    expect(within(firstColumn).getAllByText(/Teste triagem/)).toHaveLength(5);
  });

  it("redefine a paginação ao alterar filtro compartilhado sem afetar o total por coluna", () => {
    render(<KanbanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Próxima página de Em triagem" }));
    expect(screen.getByText("Página 2/2")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Buscar ocorrências no Kanban"), { target: { value: "OCR-2026" } });
    expect(screen.getByLabelText("Coluna Em triagem")).toBeTruthy();
    expect(within(screen.getByLabelText("Coluna Em triagem")).getByText("Página 1/2")).toBeTruthy();
    expect(mocks.listQueries.at(-7)?.page).toBe(1);
  });

  it("não executa consultas ativas se o intervalo de datas está invertido", () => {
    render(<KanbanPage />);
    fireEvent.change(screen.getByLabelText("Abertura desde"), { target: { value: "2026-10-31" } });
    mocks.listQueries.length = 0;
    fireEvent.change(screen.getByLabelText("Abertura até"), { target: { value: "2026-10-01" } });
    expect(screen.getByRole("alert").textContent).toMatch(/anterior ao início/);
    expect(mocks.listQueries.every(x => x.enabled === false)).toBe(true);
  });
});
