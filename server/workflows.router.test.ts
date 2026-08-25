import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  allowed: true,
  assertPermission: vi.fn(),
  listIntegrationEventCatalog: vi.fn(),
  listSimulatedWorkflows: vi.fn(),
  createSimulatedWorkflow: vi.fn(),
  updateSimulatedWorkflow: vi.fn(),
  setSimulatedWorkflowActive: vi.fn(),
  deleteSimulatedWorkflow: vi.fn(),
  listSimulatedWorkflowExecutions: vi.fn(),
  getSimulatedWorkflowExecution: vi.fn(),
  executeSimulatedWorkflow: vi.fn(),
  retrySimulatedWorkflowExecution: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  listIntegrationEventCatalog: mocks.listIntegrationEventCatalog,
  listSimulatedWorkflows: mocks.listSimulatedWorkflows,
  createSimulatedWorkflow: mocks.createSimulatedWorkflow,
  updateSimulatedWorkflow: mocks.updateSimulatedWorkflow,
  setSimulatedWorkflowActive: mocks.setSimulatedWorkflowActive,
  deleteSimulatedWorkflow: mocks.deleteSimulatedWorkflow,
  listSimulatedWorkflowExecutions: mocks.listSimulatedWorkflowExecutions,
  getSimulatedWorkflowExecution: mocks.getSimulatedWorkflowExecution,
  executeSimulatedWorkflow: mocks.executeSimulatedWorkflow,
  retrySimulatedWorkflowExecution: mocks.retrySimulatedWorkflowExecution,
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "workflow-test-user",
      name: "Usuário de Teste",
      email: "workflow@example.com",
      loginMethod: "test",
      role: "admin",
      operationalRole: "administrador",
      teamId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("procedures de Integrações & Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowed = true;
    mocks.assertPermission.mockImplementation(async () => {
      if (!mocks.allowed) throw new TRPCError({ code: "FORBIDDEN" });
    });
    mocks.listIntegrationEventCatalog.mockResolvedValue([]);
    mocks.listSimulatedWorkflows.mockResolvedValue([]);
    mocks.createSimulatedWorkflow.mockResolvedValue({ id: 1, versionId: 1 });
    mocks.updateSimulatedWorkflow.mockResolvedValue({ id: 1, versionId: 2, version: 2 });
    mocks.setSimulatedWorkflowActive.mockResolvedValue(undefined);
    mocks.deleteSimulatedWorkflow.mockResolvedValue(undefined);
    mocks.listSimulatedWorkflowExecutions.mockResolvedValue([]);
    mocks.getSimulatedWorkflowExecution.mockResolvedValue({ execution: { id: 9, mode: "simulacao" }, steps: [], logs: [] });
    mocks.executeSimulatedWorkflow.mockResolvedValue({ executionId: 9, status: "concluida", attempts: 1 });
    mocks.retrySimulatedWorkflowExecution.mockResolvedValue({ executionId: 10, status: "concluida", attempts: 1 });
  });

  it("protege o catálogo de eventos com integrations.view", async () => {
    const catalogEntry = {
      id: 9,
      code: "occurrence.created",
      source: "AXE Dispatch interno",
      description: "Contrato previsto para criação de ocorrência.",
      payloadSchema: { type: "object", required: ["id", "code"] },
      examplePayload: null,
      version: "v1",
      active: false,
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    };
    mocks.listIntegrationEventCatalog.mockResolvedValue([catalogEntry]);
    const result = await appRouter.createCaller(context()).integrations.events();

    expect(mocks.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), "integrations.view");
    expect(mocks.listIntegrationEventCatalog).toHaveBeenCalledOnce();
    expect(result).toEqual([expect.objectContaining({ code: "occurrence.created", source: "AXE Dispatch interno", version: "v1", payloadSchema: { type: "object", required: ["id", "code"] } })]);
  });

  it("aplica permissões específicas a cada ação de workflow", async () => {
    const caller = appRouter.createCaller(context());

    await caller.workflows.list();
    await caller.workflows.create({ name: "Fluxo de teste", description: null });
    await caller.workflows.update({ workflowId: 1, name: "Fluxo revisado", description: null, changeSummary: null });
    await caller.workflows.setActive({ workflowId: 1, active: true });
    await caller.workflows.delete({ workflowId: 1 });
    await caller.workflows.executions({ workflowId: 1 });
    await caller.workflows.execution({ executionId: 9 });
    await caller.workflows.execute({ workflowId: 1 });
    await caller.workflows.retryExecution({ executionId: 9 });

    expect(mocks.assertPermission.mock.calls.map(([, permission]) => permission)).toEqual([
      "workflow.view",
      "workflow.create",
      "workflow.edit",
      "workflow.activate",
      "workflow.delete",
      "logs.view",
      "logs.view",
      "workflow.execute",
      "workflow.execute",
    ]);
    expect(mocks.createSimulatedWorkflow).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7 }));
    expect(mocks.updateSimulatedWorkflow).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7 }));
  });

  it("nega a consulta quando a autorização de integrações falha", async () => {
    mocks.allowed = false;

    await expect(appRouter.createCaller(context()).integrations.events()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listIntegrationEventCatalog).not.toHaveBeenCalled();
  });
});
