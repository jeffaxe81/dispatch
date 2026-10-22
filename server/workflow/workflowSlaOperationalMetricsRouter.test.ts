import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { createWorkflowSlaOperationalRouter } from "./workflowSlaOperationalRouter";

function context(active = true): TrpcContext {
  return {
    user: {
      id: 77, openId: "sla-metrics", name: "Supervisor", email: "supervisor@example.com",
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
      pending: 101, leased: 2, deadLetter: 1, expiredLeases: 1,
      waitingRetries: 0, overdue: 9, maxLagMinutes: 30,
      generatedAt: "2026-10-22T21:00:00.000Z",
    })),
    now: vi.fn(() => "2026-10-22T21:00:00.000Z"),
  };
}

describe("D-012J J6B — metrics endpoint security", () => {
  it("consulta a agregação completa no tenant autorizado sem aceitar filtro do cliente", async () => {
    const d = deps();
    const caller = createWorkflowSlaOperationalRouter(d).createCaller(context());
    const metrics = await caller.metrics({});
    expect(metrics.pending).toBe(101);
    expect(d.metrics).toHaveBeenCalledWith({
      organizationId: 9, now: "2026-10-22T21:00:00.000Z",
    });
    expect(d.assertPermission).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }), "workflow_tasks.view");
    expect(d.requireActiveTenant).toHaveBeenCalledTimes(1);
    expect(d.list).not.toHaveBeenCalled();
    await expect(caller.metrics({ organizationId: 999 } as never)).rejects.toThrow();
    expect(d.metrics).toHaveBeenCalledTimes(1);
  });

  it("não consulta métricas quando o usuário está inativo ou sem autorização", async () => {
    const d = deps();
    await expect(createWorkflowSlaOperationalRouter(d).createCaller(context(false)).metrics({}))
      .rejects.toThrow(/inativo/i);
    expect(d.metrics).not.toHaveBeenCalled();
    const other = deps();
    other.assertPermission.mockRejectedValueOnce(new Error("acesso negado"));
    await expect(createWorkflowSlaOperationalRouter(other).createCaller(context()).metrics({}))
      .rejects.toThrow(/acesso negado/i);
    expect(other.requireActiveTenant).not.toHaveBeenCalled();
    expect(other.metrics).not.toHaveBeenCalled();
  });

  it("falha fechado quando o agregador de métricas não está configurado", async () => {
    const d = deps();
    const { metrics: _metrics, ...withoutMetrics } = d;
    await expect(createWorkflowSlaOperationalRouter(withoutMetrics).createCaller(context()).metrics({}))
      .rejects.toThrow(/indisponível/i);
  });
});
