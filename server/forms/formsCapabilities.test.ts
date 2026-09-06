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
    const ctx = context(["forms.fill", "forms.responses.view", "forms.create", "forms.edit", "forms.publish"]);
    const result = await createFormsApi(ctx).capabilities();

    expect(result).toEqual({
      canView: false,
      canFill: true,
      canViewResponses: true,
      canCorrectResponses: false,
      canManage: false,
      canCreate: true,
      canEdit: true,
      canPublish: true,
      canDisable: false,
    });
    expect(ctx.hasPermission).toHaveBeenCalledWith("forms.fill");
    expect(ctx.hasPermission).toHaveBeenCalledWith("forms.responses.correct");
    expect(ctx.hasPermission).toHaveBeenCalledWith("forms.create");
    expect(ctx.hasPermission).toHaveBeenCalledWith("forms.edit");
    expect(ctx.hasPermission).toHaveBeenCalledWith("forms.publish");
  });

  it("não depende de método do service nem concede permissão", async () => {
    const ctx = context([]);
    const result = await createFormsApi(ctx).capabilities();
    expect(result).toEqual({ canView: false, canFill: false, canViewResponses: false, canCorrectResponses: false, canManage: false, canCreate: false, canEdit: false, canPublish: false, canDisable: false });
  });
});
