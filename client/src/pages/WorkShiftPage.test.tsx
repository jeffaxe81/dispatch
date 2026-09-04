// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: null as null | {
    id: number;
    state: "em_jornada" | "em_intervalo" | "encerrada";
    startedAt: Date | null;
    breakStartedAt: Date | null;
    endedAt: Date | null;
  },
  start: vi.fn(),
  startBreak: vi.fn(),
  resume: vi.fn(),
  end: vi.fn(),
  invalidate: vi.fn(),
  error: null as Error | null,
  pending: false,
}));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ workShift: { current: { invalidate: mocks.invalidate } } }),
    workShift: {
      current: { useQuery: () => ({ data: mocks.current, isLoading: false, error: mocks.error }) },
      start: { useMutation: () => ({ mutateAsync: mocks.start, isPending: mocks.pending, error: mocks.error }) },
      break: { useMutation: () => ({ mutateAsync: mocks.startBreak, isPending: mocks.pending, error: mocks.error }) },
      resume: { useMutation: () => ({ mutateAsync: mocks.resume, isPending: mocks.pending, error: mocks.error }) },
      end: { useMutation: () => ({ mutateAsync: mocks.end, isPending: mocks.pending, error: mocks.error }) },
    },
  },
}));

import WorkShiftPage from "./WorkShiftPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.current = null;
  mocks.error = null;
  mocks.pending = false;
});

describe("WorkShiftPage", () => {
  it("mostra iniciar jornada quando não existe sessão ativa", () => {
    render(<WorkShiftPage />);
    expect(screen.getByText("Fora da jornada")).toBeTruthy();
    expect(screen.getByRole("button", { name: /iniciar jornada/i })).toBeTruthy();
  });

  it("mostra intervalo e encerramento durante jornada ativa", () => {
    mocks.current = {
      id: 10,
      state: "em_jornada",
      startedAt: new Date("2026-09-04T11:00:00.000Z"),
      breakStartedAt: null,
      endedAt: null,
    };
    render(<WorkShiftPage />);
    expect(screen.getByText("Em jornada")).toBeTruthy();
    expect(screen.getByRole("button", { name: /iniciar intervalo/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /encerrar jornada/i })).toBeTruthy();
  });

  it("mostra retomada durante intervalo", () => {
    mocks.current = {
      id: 10,
      state: "em_intervalo",
      startedAt: new Date("2026-09-04T11:00:00.000Z"),
      breakStartedAt: new Date("2026-09-04T15:00:00.000Z"),
      endedAt: null,
    };
    render(<WorkShiftPage />);
    expect(screen.getByText("Em intervalo")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retomar jornada/i })).toBeTruthy();
  });

  it("inicia a jornada e invalida o estado atual", async () => {
    mocks.start.mockResolvedValue({});
    const user = userEvent.setup();
    render(<WorkShiftPage />);
    await user.click(screen.getByRole("button", { name: /iniciar jornada/i }));
    expect(mocks.start).toHaveBeenCalledWith();
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
  });

  it("exibe erro de operação", () => {
    mocks.error = new Error("Transição de jornada inválida.");
    render(<WorkShiftPage />);
    expect(screen.getByRole("alert").textContent).toMatch(/transição de jornada inválida/i);
  });

  it("desabilita ações enquanto uma transição está em processamento", () => {
    mocks.pending = true;
    render(<WorkShiftPage />);
    expect(screen.getByRole("button", { name: /processando/i })).toHaveProperty("disabled", true);
  });
});
