import { describe, expect, it, vi } from "vitest";
import { createFormsRequestContext } from "./formsTrpcContext";

describe("D-008 tRPC forms context", () => {
  it("resolve tenant no servidor e avalia RBAC do usuário autenticado", async () => {
    const resolveTenantId = vi.fn(async () => 77);
    const hasPermission = vi.fn(async (_user: any, permission: string) => permission === "forms.view");
    const ctx = await createFormsRequestContext(
      { id: 9, teamId: 3 } as any,
      { resolveTenantId, hasPermission, service: { list: vi.fn() } as any },
    );
    expect(ctx.tenantId).toBe(77);
    expect(ctx.userId).toBe(9);
    await expect(ctx.hasPermission("forms.view")).resolves.toBe(true);
    expect(resolveTenantId).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, teamId: 3 }));
  });

  it("rejeita requisição sem usuário autenticado", async () => {
    await expect(createFormsRequestContext(null, { resolveTenantId: vi.fn(), hasPermission: vi.fn(), service: {} as any })).rejects.toThrow(/autentic/i);
  });
});
