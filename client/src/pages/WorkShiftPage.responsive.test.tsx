// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: null as null | {
    id: number;
    state: "em_jornada" | "em_intervalo" | "encerrada";
    startedAt: Date | null;
    breakStartedAt: Date | null;
    endedAt: Date | null;
  },
}));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ workShift: { current: { invalidate: vi.fn() }, history: { invalidate: vi.fn() } } }),
    workShift: {
      current: { useQuery: () => ({ data: mocks.current, isLoading: false, error: null }) },
      history: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
      start: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) },
      break: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) },
      resume: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) },
      end: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

import WorkShiftPage from "./WorkShiftPage";

afterEach(() => {
  cleanup();
  mocks.current = null;
});

describe("WorkShiftPage contrato responsivo", () => {
  it("mantém container fluido e espaçamento progressivo para mobile, tablet e desktop", () => {
    render(<WorkShiftPage />);
    const heading = screen.getByRole("heading", { name: "Jornada em Tempo Real" });
    const main = heading.closest("main");
    expect(main?.className).toContain("w-full");
    expect(main?.className).toContain("p-4");
    expect(main?.className).toContain("sm:p-6");
    expect(main?.className).toContain("lg:p-8");
    expect(heading.className).toContain("text-2xl");
    expect(heading.className).toContain("sm:text-3xl");
  });

  it("empilha os cartões no mobile e usa três colunas a partir do breakpoint sm", () => {
    mocks.current = {
      id: 11,
      state: "em_jornada",
      startedAt: new Date("2026-09-04T11:00:00.000Z"),
      breakStartedAt: null,
      endedAt: null,
    };
    render(<WorkShiftPage />);
    const startLabel = screen.getByText("Início da jornada");
    const grid = startLabel.parentElement?.parentElement;
    expect(grid?.className).toContain("grid");
    expect(grid?.className).toContain("sm:grid-cols-3");
  });

  it("preserva quebra de linha do cabeçalho e das ações para evitar compressão horizontal", () => {
    mocks.current = {
      id: 12,
      state: "em_jornada",
      startedAt: new Date("2026-09-04T11:00:00.000Z"),
      breakStartedAt: null,
      endedAt: null,
    };
    render(<WorkShiftPage />);
    const heading = screen.getByRole("heading", { name: "Jornada em Tempo Real" });
    expect(heading.parentElement?.parentElement?.className).toContain("flex-wrap");
    const actions = screen.getByLabelText("Ações da jornada");
    expect(actions.className).toContain("flex-wrap");
    expect(screen.getByRole("button", { name: /iniciar intervalo/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /encerrar jornada/i })).toBeTruthy();
  });
});
