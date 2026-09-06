import { describe, expect, it } from "vitest";
import { evaluateFormPermission, assertFormTenantScope, FORM_PERMISSIONS } from "./formAccess";

describe("D-008 form access", () => {
  it("mantém catálogo explícito de permissões", () => {
    expect(FORM_PERMISSIONS).toContain("forms.publish");
    expect(FORM_PERMISSIONS).toContain("forms.responses.correct");
    expect(FORM_PERMISSIONS).toContain("forms.manage");
  });

  it("não usa fallback legado quando existem atribuições dinâmicas", () => {
    expect(evaluateFormPermission({ active: true, operationalRole: "administrador", hasDynamicAssignments: true, dynamicPermissions: [] }, "forms.publish")).toBe(false);
    expect(evaluateFormPermission({ active: true, operationalRole: "agente", hasDynamicAssignments: true, dynamicPermissions: ["forms.fill"] }, "forms.fill")).toBe(true);
  });

  it("aplica fallback operacional somente sem RBAC dinâmico", () => {
    expect(evaluateFormPermission({ active: true, operationalRole: "administrador", hasDynamicAssignments: false, dynamicPermissions: [] }, "forms.manage")).toBe(true);
    expect(evaluateFormPermission({ active: true, operationalRole: "supervisor", hasDynamicAssignments: false, dynamicPermissions: [] }, "forms.responses.correct")).toBe(true);
    expect(evaluateFormPermission({ active: true, operationalRole: "agente", hasDynamicAssignments: false, dynamicPermissions: [] }, "forms.publish")).toBe(false);
  });

  it("nega acesso entre tenants mesmo com permissão funcional", () => {
    expect(() => assertFormTenantScope(10, 11)).toThrow(/tenant/i);
    expect(() => assertFormTenantScope(10, 10)).not.toThrow();
  });
});
