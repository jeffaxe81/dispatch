import { describe, expect, it, vi } from "vitest";
import { createFormsTrpcRouter } from "./formsTrpcRouter";

describe("D-008 capabilities tRPC", () => {
  it("expõe capabilities usando o contexto de autorização do módulo", async () => {
    const createContext = vi.fn(async () => ({
      tenantId: 7,
      userId: 42,
      hasPermission: vi.fn(async (permission: string) => permission === "forms.fill"),
      assertIncidentScope: vi.fn(),
      assertSubmissionScope: vi.fn(),
      service: {},
    }));
    const caller = createFormsTrpcRouter(createContext as any).createCaller({ user: { id: 42 } } as any);

    await expect(caller.capabilities()).resolves.toEqual({
      canView: false,
      canFill: true,
      canViewResponses: false,
      canCorrectResponses: false,
      canManage: false,
      canCreate: false,
      canEdit: false,
      canPublish: false,
      canDisable: false,
    });
    expect(createContext).toHaveBeenCalledTimes(1);
  });
});
