import { describe, expect, it, vi } from "vitest";
import { createFormsApi } from "./formsRouter";

function context(allowed: string[]) {
  return {
    tenantId: 7,
    userId: 42,
    hasPermission: vi.fn(async (permission: string) => allowed.includes(permission)),
    assertIncidentScope: vi.fn(),
    assertSubmissionScope: vi.fn(),
    service: {},
  } as any;
}

describe("D-008 capabilities", () => {
  it("expõe à UI exatamente as permissões avaliadas pelo backend", async () => {
    const ctx = context(["forms.fill", "forms.responses.view"]);
    const result = await createFormsApi(ctx).capabilities();

    expect(result).toEqual({
      canView: false,
      canFill: true,
      canViewResponses: true,
      canCorrectResponses: false,
      canManage: false,
    });
    expect(ctx.hasPermission).toHaveBeenCalledWith("forms.fill");
    expect(ctx.hasPermission).toHaveBeenCalledWith("forms.responses.correct");
  });

  it("não depende de método do service nem concede permissão", async () => {
    const ctx = context([]);
    const result = await createFormsApi(ctx).capabilities();
    expect(result).toEqual({ canView: false, canFill: false, canViewResponses: false, canCorrectResponses: false, canManage: false });
  });
});
