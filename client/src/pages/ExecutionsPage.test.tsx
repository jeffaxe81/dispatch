import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), retry: vi.fn(), refetch: vi.fn() }));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/QueryState", () => ({ QueryState: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ workflows: { executions: { invalidate: vi.fn() } }, integrations: { overview: { invalidate: vi.fn() } } }),
    access: { me: { useQuery: () => ({ data: { permissions: ["workflow.execute", "logs.view"] }, isLoading: false, error: null }) } },
    workflows: {
      executions: { useQuery: () => ({ data: [{ execution: { id: 8, status: "falha", attempts: 1, maxAttempts: 3, triggerType: "manual", createdAt: new Date("2026-08-20T12:00:00.000Z"), errorData: { message: "Falha controlada" } }, workflowName: "Fluxo de teste", initiatorName: "Administrador" }], isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) },
      execution: { useQuery: () => ({ data: { execution: { id: 8, status: "falha" }, workflowName: "Fluxo de teste", steps: [{ id: 1, nodeId: "notification-1", nodeType: "notification.simulate", status: "falha", durationMs: 8, errorData: { message: "Falha controlada" } }], logs: [{ id: 1, level: "erro", createdAt: new Date("2026-08-20T12:00:01.000Z"), message: "Execução simulada finalizada com falha controlada." }] }, isLoading: false, error: null, refetch: vi.fn() }) },
      retryExecution: { useMutation: () => ({ mutate: mocks.retry, isPending: false }) },
    },
  },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/integracoes/execucoes", mocks.navigate] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import ExecutionsPage from "./ExecutionsPage";

describe("ExecutionsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("apresenta detalhe de uma falha controlada e permite reenfileirar a tentativa", async () => {
    const user = userEvent.setup();
    render(<ExecutionsPage />);

    expect(screen.getByText("Falha controlada")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /reprocessar/i }));
    expect(mocks.retry).toHaveBeenCalledWith({ executionId: 8 });
    await user.click(screen.getByRole("button", { name: /detalhes/i }));
    expect(screen.getByText("notification.simulate")).toBeTruthy();
    expect(screen.getByText("Execução simulada finalizada com falha controlada.")).toBeTruthy();
  });
});
