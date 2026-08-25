import { describe, expect, it } from "vitest";
import { evaluatePermission, evaluateTeamScope, hasAdministratorAssignment, hasSuperAdministratorAssignment, requiresExplicitTeamSelection, resolveEffectivePermissions } from "./accessControl";

describe("decisão de permissões RBAC", () => {
  it("mantém a compatibilidade de administrador legado durante a transição", () => {
    expect(evaluatePermission({ active: true, operationalRole: "administrador", hasDynamicAssignments: false, dynamicPermissions: [] }, "system.configure")).toBe(true);
    expect(evaluatePermission({ active: true, operationalRole: "agente", hasDynamicAssignments: false, dynamicPermissions: [] }, "occurrences.transition")).toBe(true);
  });

  it("mantém permissões de perfis legados quando não há catálogo dinâmico migrado", () => {
    expect(resolveEffectivePermissions({ active: true, operationalRole: "operador", hasDynamicAssignments: false, dynamicPermissions: [] }, [])).toEqual(expect.arrayContaining(["occurrences.view", "occurrences.create", "dispatch.view"]));
    expect(resolveEffectivePermissions({ active: true, operationalRole: "administrador", hasDynamicAssignments: false, dynamicPermissions: [] }, [])).toContain("*");
  });

  it("aceita permissões dinâmicas do módulo de integrações", () => {
    expect(evaluatePermission({ active: true, operationalRole: "operador", hasDynamicAssignments: true, dynamicPermissions: ["integrations.view"] }, "integrations.view")).toBe(true);
    expect(evaluatePermission({ active: true, operationalRole: "operador", hasDynamicAssignments: true, dynamicPermissions: ["integrations.view"] }, "workflow.execute")).toBe(false);
  });

  it("nega permissões para usuário inativo", () => {
    expect(evaluatePermission({ active: false, operationalRole: "administrador", hasDynamicAssignments: false, dynamicPermissions: [] }, "users.edit")).toBe(false);
  });

  it("usa a matriz dinâmica quando o usuário possui papel atribuído", () => {
    expect(evaluatePermission({ active: true, operationalRole: "administrador", hasDynamicAssignments: true, dynamicPermissions: ["reports.view"] }, "users.edit")).toBe(false);
    expect(evaluatePermission({ active: true, operationalRole: "operador", hasDynamicAssignments: true, dynamicPermissions: ["reports.view"] }, "reports.view")).toBe(true);
  });

  it("respeita escopo de organização, unidade e equipe", () => {
    const team = { id: 7, organizationId: 10, organizationalUnitId: 20 };
    expect(evaluateTeamScope([{ roleCode: "gestor", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null }], team)).toBe(true);
    expect(evaluateTeamScope([{ roleCode: "supervisor", defaultScope: "unidade", organizationId: 10, organizationalUnitId: 20, teamId: null }], team)).toBe(true);
    expect(evaluateTeamScope([{ roleCode: "agente_campo", defaultScope: "equipe", organizationId: null, organizationalUnitId: null, teamId: 8 }], team)).toBe(false);
  });

  it("exige filtro de equipe para papéis dinâmicos sem escopo global", () => {
    expect(requiresExplicitTeamSelection([{ roleCode: "gestor", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null }])).toBe(true);
    expect(requiresExplicitTeamSelection([{ roleCode: "administrador", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null }])).toBe(false);
    expect(requiresExplicitTeamSelection([])).toBe(false);
  });

  it("reconhece exclusivamente a atribuição do perfil Super Administrador", () => {
    expect(hasSuperAdministratorAssignment([{ roleCode: "super_administrador", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null }])).toBe(true);
    expect(hasSuperAdministratorAssignment([{ roleCode: "administrador", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null }])).toBe(false);
  });

  it("reconhece somente o perfil Administrador como aprovador de integração produtiva", () => {
    expect(hasAdministratorAssignment([{ roleCode: "administrador", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null }])).toBe(true);
    expect(hasAdministratorAssignment([{ roleCode: "supervisor", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null }])).toBe(false);
  });
});
