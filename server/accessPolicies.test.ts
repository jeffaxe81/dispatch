import { describe, expect, it } from "vitest";
import { canUpdateRoleDefinition, isCanonicalGlobalScope, isRoleScopeAssignmentValid } from "./accessPolicies";

describe("proteção de perfis padrão", () => {
  it("impede desativação e alteração da matriz de perfis padrão", () => {
    expect(canUpdateRoleDefinition({ isSystem: true, active: false, permissionIdsProvided: false })).toBe(false);
    expect(canUpdateRoleDefinition({ isSystem: true, permissionIdsProvided: true })).toBe(false);
    expect(canUpdateRoleDefinition({ isSystem: true, permissionIdsProvided: false, defaultScopeProvided: true })).toBe(false);
  });

  it("permite administrar perfis personalizados", () => {
    expect(canUpdateRoleDefinition({ isSystem: false, active: false, permissionIdsProvided: true })).toBe(true);
  });

  it("impede concessão global quando há qualquer campo de escopo preenchido", () => {
    expect(isRoleScopeAssignmentValid({ defaultScope: "global" })).toBe(true);
    expect(isRoleScopeAssignmentValid({ defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null })).toBe(true);
    for (const input of [
      { organizationId: 1 },
      { organizationalUnitId: 2 },
      { teamId: 3 },
      { organizationId: 0 },
      { organizationId: -1, teamId: null },
      { organizationId: 10, organizationalUnitId: 20, teamId: 30 },
    ]) {
      const scope = { defaultScope: "global" as const, ...input };
      expect(isCanonicalGlobalScope(scope)).toBe(false);
      expect(isRoleScopeAssignmentValid(scope)).toBe(false);
    }
  });

  it("preserva o escopo QA por organização e equipe sem atribuir poderes globais", () => {
    const profile = { defaultScope: "equipe" as const, organizationId: 10, teamId: 7 };
    expect(isRoleScopeAssignmentValid(profile)).toBe(true);
    expect(isCanonicalGlobalScope(profile)).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "organizacao", organizationId: 10 })).toBe(true);
  });

  it("exige os vínculos mínimos para cada escopo de papel", () => {
    expect(isRoleScopeAssignmentValid({ defaultScope: "organizacao" })).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "organizacao", organizationId: 1 })).toBe(true);
    expect(isRoleScopeAssignmentValid({ defaultScope: "unidade", organizationId: 1 })).toBe(false);
    expect(isRoleScopeAssignmentValid({ defaultScope: "unidade", organizationId: 1, organizationalUnitId: 2 })).toBe(true);
    expect(isRoleScopeAssignmentValid({ defaultScope: "equipe", teamId: 3 })).toBe(true);
  });
});
