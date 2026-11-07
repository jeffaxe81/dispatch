// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  superAdmin: true,
  accessLoading: false,
  accessError: null as { message: string } | null,
  reportError: null as { message: string } | null,
  reportLoading: false,
  reportFetching: false,
  total: 1,
  rows: [{
    attemptId: "12345678-1234-4abc-8def-1234567890ab",
    incidentId: 45,
    actorUserId: 7,
    teamId: 3,
    state: "cleanup_required" as const,
    createdAt: new Date("2026-11-06T10:00:00.000Z"),
    updatedAt: new Date("2026-11-06T10:02:00.000Z"),
    hasEvidenceReference: false,
    incidentExists: false,
    reason: "cleanup_pending_review" as const,
  }],
  requests: [] as Array<{ page: number; pageSize: number; state: string; enabled: boolean }>,
  refetch: vi.fn(),
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    access: {
      me: { useQuery: () => ({
        data: { isSuperAdministrator: mocks.superAdmin },
        isLoading: mocks.accessLoading,
        error: mocks.accessError,
      }) },
    },
    settings: {
      evidenceRecovery: {
        useQuery: (input: { page: number; pageSize: number; state: string }, opts: { enabled: boolean }) => {
          mocks.requests.push({ ...input, enabled: opts.enabled });
          return {
            data: { rows: mocks.rows, total: mocks.total, page: input.page,
              pageSize: input.pageSize, state: input.state, staleAfterMinutes: 15 },
            isLoading: mocks.reportLoading,
            isFetching: mocks.reportFetching,
            error: mocks.reportError,
            refetch: mocks.refetch,
          };
        },
      },
    },
  },
}));

import EvidenceRecoveryPage, { formatRecoveryDate } from "./EvidenceRecoveryPage";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { value: () => false, configurable: true },
  setPointerCapture: { value: () => undefined, configurable: true },
  releasePointerCapture: { value: () => undefined, configurable: true },
  scrollIntoView: { value: () => undefined, configurable: true },
});

beforeEach(() => {
  mocks.superAdmin = true;
  mocks.accessLoading = false;
  mocks.accessError = null;
  mocks.reportError = null;
  mocks.reportLoading = false;
  mocks.reportFetching = false;
  mocks.total = 1;
  mocks.rows = [{
    attemptId: "12345678-1234-4abc-8def-1234567890ab",
    incidentId: 45, actorUserId: 7, teamId: 3,
    state: "cleanup_required",
    createdAt: new Date("2026-11-06T10:00:00.000Z"),
    updatedAt: new Date("2026-11-06T10:02:00.000Z"),
    hasEvidenceReference: false, incidentExists: false,
    reason: "cleanup_pending_review",
  }];
  mocks.requests.length = 0;
  mocks.refetch.mockReset();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("EvidenceRecoveryPage — painel exclusivo de Super Administrador", () => {
  it("renders a redacted read-only queue with incident, owner and recovery reason", () => {
    render(<EvidenceRecoveryPage />);

    expect(screen.getByRole("heading", { name: "Conciliação de evidências" })).toBeTruthy();
    expect(screen.getByText("Somente leitura")).toBeTruthy();
    expect(screen.getByText("Verificar arquivo")).toBeTruthy();
    expect(screen.getByText(/#45/)).toBeTruthy();
    expect(screen.getByText("Ausente")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Tentativas de conciliação" })).toBeTruthy();
    expect(mocks.requests.at(-1)).toMatchObject({ page: 1, pageSize: 25, state: "all", enabled: true });
    expect(screen.queryByRole("button", { name: /excluir|apagar|remover arquivo/i })).toBeNull();
  });

  it("does not query or show the queue to non-super administrators", () => {
    mocks.superAdmin = false;
    render(<EvidenceRecoveryPage />);
    expect(screen.getByRole("alert").textContent).toContain("Acesso restrito");
    expect(screen.queryByRole("list", { name: "Tentativas de conciliação" })).toBeNull();
    expect(mocks.requests.every(request => request.enabled === false)).toBe(true);
  });

  it("filters on the server by incident recovery state, resetting page to one", async () => {
    const user = userEvent.setup();
    render(<EvidenceRecoveryPage />);
    await user.click(screen.getByRole("combobox", { name: "Filtrar situação" }));
    await user.click(screen.getByRole("option", { name: "Reservas antigas" }));
    expect(mocks.requests.at(-1)).toMatchObject({ page: 1, state: "stale_reserved", enabled: true });
  });

  it("bounds pagination and exposes refresh without any mutation", async () => {
    const user = userEvent.setup();
    mocks.total = 33;
    render(<EvidenceRecoveryPage />);
    await user.click(screen.getByRole("button", { name: /Próxima/i }));
    expect(mocks.requests.at(-1)).toMatchObject({ page: 2, pageSize: 25, state: "all" });
    await user.click(screen.getByRole("button", { name: /Anterior/i }));
    expect(mocks.requests.at(-1)).toMatchObject({ page: 1 });
    await user.click(screen.getByRole("button", { name: "Atualizar fila" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("shows an empty state and a non-destructive error state", () => {
    mocks.rows = [];
    mocks.total = 0;
    const view = render(<EvidenceRecoveryPage />);
    expect(screen.getByText("Nenhuma pendência neste filtro")).toBeTruthy();
    view.unmount();

    mocks.reportError = { message: "Falha de consulta" };
    render(<EvidenceRecoveryPage />);
    expect(screen.getByRole("alert").textContent).toContain("Falha de consulta");
  });

  it("handles unknown timestamps without displaying an invalid date", () => {
    expect(formatRecoveryDate("not-a-date")).toBe("—");
    expect(formatRecoveryDate(null)).toBe("—");
  });
});
