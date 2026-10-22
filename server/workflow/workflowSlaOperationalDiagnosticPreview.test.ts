import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { createWorkflowSlaOperationalRouter } from "./workflowSlaOperationalRouter";

const now = "2026-10-22T22:00:00.000Z";
function context(active = true): TrpcContext {
  return {
    user: {
      id: 77, openId: "sla-supervisor", name: "Supervisor", email: "sup@example.com",
      loginMethod: "test", role: "user", operationalRole: "supervisor",
      teamId: null, active, createdAt: new Date(), updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: { "x-organization-id": "999" }, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}
function deps() {
  return {
    assertPermission: vi.fn(async () => undefined),
    requireActiveTenant: vi.fn(async () => 9),
    list: vi.fn(async () => []),
    metrics: vi.fn(async () => ({
      pending: 1, leased: 0, deadLetter: 0, expiredLeases: 0,
      waitingRetries: 0, overdue: 0, maxLagMinutes: 0, generatedAt: now,
    })),
    readinessPreviewMode: vi.fn(() => "manual_homologation" as const),
    now: vi.fn(() => now),
  };
}

describe("D-012J J6C — tRPC diagnostic preview", () => {
  it("não revela tenant de cliente e devolve not_ready sem probes reais", async () => {
    const d = deps();
    const caller = createWorkflowSlaOperationalRouter(d).createCaller(context());
    const result = await caller.diagnostic({});
    expect(result).toMatchObject({
      organizationId: 9, status: "not_ready",
      components: { scheduler: "unknown", adapter: "unknown" },
      backlog: { pending: 1 },
      reasons: ["scheduler_unavailable", "adapter_unavailable"],
    });
    expect(d.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }), "workflow_tasks.view");
    expect(d.metrics).toHaveBeenCalledWith({ organizationId: 9, now });
    await expect(caller.diagnostic({ organizationId: 10 } as never)).rejects.toThrow();
    await expect(caller.diagnostic({ mode: "manual_homologation" } as never)).rejects.toThrow();
    expect(d.metrics).toHaveBeenCalledTimes(1);
  });

  it("nega consulta antes de provas e métricas para usuário inativo ou não autorizado", async () => {
    const d = deps();
    await expect(createWorkflowSlaOperationalRouter(d).createCaller(context(false)).diagnostic({}))
      .rejects.toThrow(/inativo/);
    expect(d.metrics).not.toHaveBeenCalled();
    const forbidden = deps();
    forbidden.assertPermission.mockRejectedValueOnce(new Error("Sem autorização"));
    await expect(createWorkflowSlaOperationalRouter(forbidden).createCaller(context()).diagnostic({}))
      .rejects.toThrow(/autoriza/i);
    expect(forbidden.requireActiveTenant).not.toHaveBeenCalled();
    expect(forbidden.metrics).not.toHaveBeenCalled();
  });

  it("falha fechado e não amplia escopo se agregação não existir", async () => {
    const d = deps();
    const { metrics: _metrics, ...noMetrics } = d;
    await expect(createWorkflowSlaOperationalRouter(noMetrics).createCaller(context()).diagnostic({}))
      .rejects.toThrow(/métricas SLA indisponíveis/i);
  });
});
