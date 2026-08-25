import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveWorkflow: vi.fn(),
  setActive: vi.fn(),
  executeWorkflow: vi.fn(),
  retryExecution: vi.fn(),
  navigate: vi.fn(),
  workflow: {
    workflow: { id: 1, name: "Fluxo reaberto", description: "Fluxo persistido", currentVersion: 3, active: false },
    creatorName: "Administrador",
    versions: [{ id: 3, version: 3, definition: { nodes: [{ id: "trigger-1", type: "trigger.manual", label: "Entrada persistida", position: { x: 30, y: 30 }, configuration: { mode: "simulacao", inputLabel: "entrada_reaberta" } }, { id: "notification-1", type: "notification.simulate", label: "Aviso persistido", position: { x: 260, y: 30 }, configuration: { mode: "simulacao", channel: "webhook_simulado", messageTemplate: "Alerta {{ocorrencia.codigo}}" } }], edges: [{ id: "edge-1", source: "trigger-1", target: "notification-1" }], metadata: { mode: "simulacao", definitionVersion: 1 } } }],
  },
}));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/QueryState", () => ({ QueryState: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ workflows: { get: { invalidate: vi.fn() }, list: { invalidate: vi.fn() }, executions: { invalidate: vi.fn() } }, integrations: { overview: { invalidate: vi.fn() } } }),
    access: { me: { useQuery: () => ({ data: { permissions: ["workflow.view", "workflow.edit", "workflow.activate", "workflow.execute", "logs.view"] }, isLoading: false, error: null }) } },
    workflows: {
      get: { useQuery: () => ({ data: mocks.workflow, isLoading: false, error: null }) },
      update: { useMutation: () => ({ mutate: mocks.saveWorkflow, isPending: false, error: null }) },
      setActive: { useMutation: () => ({ mutate: mocks.setActive, isPending: false, error: null }) },
      executions: { useQuery: () => ({ data: [{ execution: { id: 41, status: "concluida", attempts: 1, maxAttempts: 3, createdAt: new Date("2026-08-22T12:00:00.000Z"), errorData: null } }], isLoading: false, isFetching: false, error: null, refetch: vi.fn() }) },
      execution: { useQuery: () => ({ data: { execution: { id: 41, status: "concluida", attempts: 1, maxAttempts: 3 }, steps: [{ id: 1, nodeId: "notification-1", nodeType: "notification.simulate", status: "concluida", durationMs: 11, outputData: { simulation: true }, errorData: null }], logs: [{ id: 1, level: "sucesso", createdAt: new Date("2026-08-22T12:00:02.000Z"), message: "Notificação simulada registrada." }] }, isLoading: false, error: null }) },
      execute: { useMutation: () => ({ mutate: mocks.executeWorkflow, isPending: false, error: null }) },
      retryExecution: { useMutation: () => ({ mutate: mocks.retryExecution, isPending: false, error: null }) },
    },
  },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/integracoes/workflows/1", mocks.navigate], useRoute: () => [true, { id: "1" }] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import WorkflowBuilderPage from "./WorkflowBuilderPage";

describe("WorkflowBuilderPage com workflow reaberto", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("carrega, seleciona e salva uma configuração persistida do nó no editor completo", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilderPage />);

    await user.click(screen.getByRole("button", { name: /aviso persistido/i }));
    expect(screen.getByText("Canal selecionado: webhook_simulado")).toBeTruthy();
    const message = screen.getByDisplayValue("Alerta {{ocorrencia.codigo}}");
    await user.clear(message);
    await user.type(message, "Alerta reaberto ocorrencia.codigo");
    await user.click(screen.getByRole("button", { name: /salvar versão/i }));

    expect(mocks.saveWorkflow).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 1, definition: expect.objectContaining({ nodes: expect.arrayContaining([expect.objectContaining({ id: "notification-1", configuration: expect.objectContaining({ channel: "webhook_simulado", messageTemplate: "Alerta reaberto ocorrencia.codigo" }) })]) }) }));
  });

  it("oferece falha controlada e abre o histórico detalhado do workflow", async () => {
    const user = userEvent.setup();
    render(<WorkflowBuilderPage />);

    expect(screen.getAllByRole("button", { name: /testar falha/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("Histórico deste workflow")).toBeTruthy();
    expect(screen.getByText("Automação real controlada")).toBeTruthy();
    expect(screen.getByText("Receber dados externos")).toBeTruthy();
    expect(screen.getByText("Início da trilha")).toBeTruthy();
    expect(screen.getByText("Fim da trilha")).toBeTruthy();
    await user.click(screen.getByText("Execução #41"));
    expect(screen.getByText("Detalhes da execução simulada")).toBeTruthy();
    expect(screen.getAllByText("notification.simulate").length).toBeGreaterThan(0);
    expect(screen.getByText("Notificação simulada registrada.")).toBeTruthy();
  });
});
