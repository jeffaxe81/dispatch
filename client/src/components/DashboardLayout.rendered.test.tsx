// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  role: "administrador",
  isSuperAdministrator: false,
  assignments: [] as { roleCode: string }[],
  sidebarState: "expanded" as "expanded" | "collapsed",
  toggleSidebar: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: 1, name: "Usuário de teste", email: "teste@axe.local", operationalRole: mocks.role },
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    access: {
      me: { useQuery: () => ({ data: { permissions: mocks.permissions, isSuperAdministrator: mocks.isSuperAdministrator, assignments: mocks.assignments } }) },
      myProfilePhoto: { useQuery: () => ({ data: null }) },
    },
  },
}));

vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useNetworkStatus", () => ({ useNetworkStatus: () => "online" }));
vi.mock("@/components/ui/sidebar", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/ui/sidebar")>();
  return { ...actual, useSidebar: () => ({ state: mocks.sidebarState, toggleSidebar: mocks.toggleSidebar }) };
});

import DashboardLayout from "./DashboardLayout";

function renderSidebar() {
  return render(<DashboardLayout><div>Conteúdo de teste</div></DashboardLayout>);
}

describe("DashboardLayout renderizado", () => {
  beforeEach(() => {
    mocks.permissions = [];
    mocks.role = "administrador";
    mocks.isSuperAdministrator = false;
    mocks.assignments = [];
    mocks.sidebarState = "expanded";
    mocks.toggleSidebar.mockReset();
  });

  afterEach(cleanup);

  it("mostra todos os itens e botões laterais ao superadministrador", () => {
    mocks.isSuperAdministrator = true;
    renderSidebar();

    for (const label of ["Central", "Ocorrências", "Dashboards e Relatórios", "Equipes", "Kanban", "Aplicativo Agente", "Viaturas", "Integrações", "Administração", "Usuários", "Perfis", "Escopos", "Log de operações", "Configurações"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /sair do axe dispatch/i })).toBeTruthy();
  });

  it("mantém apenas a navegação autorizada para despachador", () => {
    mocks.role = "despachador";
    mocks.permissions = ["occurrences.view", "teams.view", "dispatch.view", "reports.view"];
    renderSidebar();

    expect(screen.getByText("Central")).toBeTruthy();
    expect(screen.getByText("Kanban")).toBeTruthy();
    expect(screen.queryByText("Configurações")).toBeNull();
  });

  it("oculta Central e Kanban para agente de campo e mantém o Aplicativo Agente", () => {
    mocks.role = "agente";
    mocks.permissions = ["occurrences.view", "teams.view", "dispatch.view", "occurrences.transition"];
    renderSidebar();

    expect(screen.queryByText("Central")).toBeNull();
    expect(screen.queryByText("Kanban")).toBeNull();
    expect(screen.getByText("Aplicativo Agente")).toBeTruthy();
  });

  it("mantém o controle de recolhimento acionável", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Toggle navigation" }));
    expect(mocks.toggleSidebar).toHaveBeenCalledOnce();
  });
});
