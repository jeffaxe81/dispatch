import { describe, expect, it } from "vitest";
import { canUpdateRoleDefinition, isRoleScopeAssignmentValid } from "./accessPolicies";

describe("proteção de perfis padrão", () => {
  it("impede desativação e alteração da matriz de perfis padrão", () => {
    expect(canUpdateRoleDefinition({ isSystem: true, active: false, permissionIdsProvided: false })).toBe(false);
    expect(canUpdateRoleDefinition({ isSystem: true, permissionIdsProvided: true })).toBe(false);
  });

  it("permite administrar perfis personalizados", () => {
    expect(canUpdateRoleDefinition({ isSystem: false, active: false, permissionIdsProvided: true })).toBe(true);
  });

  it("exige os vínculos mínimos para cada escopo de papel", () => {
    expect(isRoleScopeAssignmentValid({ defaultScope: "organizacao" })).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "organizacao", organizationId: 1 })).toBe(true);
    expect(isRoleScopeAssignmentValid({ defaultScope: "unidade", organizationId: 1 })).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "unidade", organizationId: 1, organizationalUnitId: 2 })).toBe(true);
    expect(isRoleScopeAssignmentValid({ defaultScope: "equipe", teamId: 3 })).toBe(true);
  });

  it("rejeita campos de escopo incompatíveis para não ampliar papel silenciosamente", () => {
    expect(isRoleScopeAssignmentValid({ defaultScope: "global", organizationId: 7 })).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "global", teamId: 3 })).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "organizacao", organizationId: 7, teamId: 3 })).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "unidade", organizationId: 7, organizationalUnitId: 2, teamId: 3 })).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "equipe", organizationId: 7, teamId: 3 })).toBe(false);
  });
});
