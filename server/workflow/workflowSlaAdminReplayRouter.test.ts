import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { createWorkflowSlaAdminReplayRouter } from "./workflowSlaAdminReplayRouter";

function context(): TrpcContext {
  return {
    user: {
      id: 77,
      openId: "sla-admin",
      name: "Admin SLA",
      email: "sla@example.com",
      loginMethod: "test",
      role: "user",
      operationalRole: "administrador",
      teamId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: { "x-organization-id": "9" }, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function deps() {
  return {
    enabled: vi.fn(() => true),
    assertPermission: vi.fn(async () => undefined),
    assertAdministrator: vi.fn(async () => undefined),
    requireActiveTenant: vi.fn(async () => 9),
    replay: vi.fn(async () => ({
      intentId: 44,
      organizationId: 9,
      status: "pending" as const,
      version: 8,
    })),
    now: vi.fn(() => "2026-10-20T18:45:00.000Z"),
  };
}

describe("D-012I I5F — router administrativo de replay", () => {
  it("resolve tenant e ator no servidor e exige workflow.execute + administrador", async () => {
    const d = deps();
    const caller = createWorkflowSlaAdminReplayRouter(d).createCaller(context());
    const result = await caller.replay({
      intentId: 44,
      reason: "Falha externa corrigida",
    });

    expect(d.assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 77 }),
      "workflow.execute",
    );
    expect(d.assertAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({ id: 77 }),
    );
    expect(d.requireActiveTenant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 77 }),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(d.replay).toHaveBeenCalledWith({
      intentId: 44,
      organizationId: 9,
      actorUserId: 77,
      reason: "Falha externa corrigida",
      administratorApproved: true,
      now: "2026-10-20T18:45:00.000Z",
    });
    expect(result).toEqual(expect.objectContaining({ status: "pending", version: 8 }));
  });

  it("rejeita tenant e aprovação controlados pelo cliente", async () => {
    const d = deps();
    const caller = createWorkflowSlaAdminReplayRouter(d).createCaller(context());
    await expect(
      caller.replay({
        intentId: 44,
        reason: "Falha externa corrigida",
        organizationId: 999,
      } as never),
    ).rejects.toThrow();
    await expect(
      caller.replay({
        intentId: 44,
        reason: "Falha externa corrigida",
        administratorApproved: true,
      } as never),
    ).rejects.toThrow();
    expect(d.replay).not.toHaveBeenCalled();
  });

  it("feature gate desligado falha antes de autorização/tenant/service", async () => {
    const d = deps();
    d.enabled.mockReturnValue(false);
    const caller = createWorkflowSlaAdminReplayRouter(d).createCaller(context());
    await expect(
      caller.replay({ intentId: 44, reason: "Falha externa corrigida" }),
    ).rejects.toThrow(/desabilitado/i);
    expect(d.assertPermission).not.toHaveBeenCalled();
    expect(d.requireActiveTenant).not.toHaveBeenCalled();
    expect(d.replay).not.toHaveBeenCalled();
  });

  it("nega perfil sem autorização administrativa sem tocar no serviço", async () => {
    const d = deps();
    d.assertAdministrator.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Administrador obrigatório." }),
    );
    const caller = createWorkflowSlaAdminReplayRouter(d).createCaller(context());
    await expect(
      caller.replay({ intentId: 44, reason: "Falha externa corrigida" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(d.replay).not.toHaveBeenCalled();
  });
});
