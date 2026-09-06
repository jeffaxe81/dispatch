import { describe, expect, it, vi } from "vitest";
import { createFormsApi } from "./formsRouter";

describe("D-008 forms API security", () => {
  it("usa tenant autenticado e ignora tenant fornecido pelo cliente", async () => {
    const service = { list: vi.fn(async () => []) };
    const api = createFormsApi({ tenantId: 7, userId: 9, hasPermission: () => true, service: service as any });
    await api.list({ tenantId: 999 } as any);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7 }));
  });

  it("exige permissão específica por operação", async () => {
    const service = { publish: vi.fn() };
    const api = createFormsApi({ tenantId: 7, userId: 9, hasPermission: p => p !== "forms.publish", service: service as any });
    await expect(api.publish({ versionId: 3 })).rejects.toThrow(/permiss/i);
    expect(service.publish).not.toHaveBeenCalled();
  });

  it("falha fechado quando a autorização assíncrona nega acesso", async () => {
    const service = { publish: vi.fn() };
    const hasPermission = vi.fn(async (permission: string) => permission !== "forms.publish");
    const api = createFormsApi({ tenantId: 7, userId: 9, hasPermission: hasPermission as any, service: service as any });
    await expect(api.publish({ versionId: 3 })).rejects.toThrow(/permiss/i);
    expect(hasPermission).toHaveBeenCalledWith("forms.publish");
    expect(service.publish).not.toHaveBeenCalled();
  });

  it("aceita autorização assíncrona positiva e mantém tenant do servidor", async () => {
    const service = { list: vi.fn(async () => []) };
    const api = createFormsApi({ tenantId: 7, userId: 9, hasPermission: async () => true, service: service as any });
    await api.list({ tenantId: 999 } as any);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7, actorUserId: 9 }));
  });

  it("mantém superfície operacional prevista", () => {
    const api = createFormsApi({ tenantId: 7, userId: 9, hasPermission: () => true, service: {} as any });
    expect(Object.keys(api)).toEqual(expect.arrayContaining(["list", "get", "createDraft", "updateDraft", "publish", "disable", "bind", "startSubmission", "submit", "correct", "forIncident", "uploadAttachment"]));
  });
});
