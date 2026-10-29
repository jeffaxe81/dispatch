import { describe, expect, it } from "vitest";
import { evaluatePermission, evaluateTeamScope, hasAdministratorAssignment, hasAdministratorAssignmentForOrganization, hasSuperAdministratorAssignment, requiresExplicitTeamSelection, resolveEffectivePermissions } from "./accessControl";

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

  it("reconhece jornada dinâmica sem conceder controle ao agente legado", () => {
    expect(evaluatePermission({
      active: true,
      operationalRole: "agente",
      hasDynamicAssignments: true,
      dynamicPermissions: ["work_shifts.view", "work_shifts.control"],
    }, "work_shifts.control")).toBe(true);

    expect(evaluatePermission({
      active: true,
      operationalRole: "agente",
      hasDynamicAssignments: false,
      dynamicPermissions: [],
    }, "work_shifts.control")).toBe(false);

    expect(evaluatePermission({
      active: true,
      operationalRole: "administrador",
      hasDynamicAssignments: false,
      dynamicPermissions: [],
    }, "work_shifts.control")).toBe(true);
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

  it("falha fechado para atribuições de equipe, organização ou unidade com campos cruzados", () => {
    const team = { id: 7, organizationId: 10, organizationalUnitId: 20 };
    const malformed = [
      { roleCode: "gestor", defaultScope: "organizacao", organizationId: 99, organizationalUnitId: null, teamId: 7 },
      { roleCode: "gestor", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: 20, teamId: null },
      { roleCode: "supervisor", defaultScope: "unidade", organizationId: 10, organizationalUnitId: 20, teamId: 7 },
      { roleCode: "agente_campo", defaultScope: "equipe", organizationId: 10, organizationalUnitId: null, teamId: 7 },
      { roleCode: "admin", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: 7 },
    ];
    for (const assignment of malformed) {
      expect(evaluateTeamScope([assignment] as any, team)).toBe(false);
    }
    expect(evaluateTeamScope([
      { roleCode: "agente_campo", defaultScope: "equipe", organizationId: null, organizationalUnitId: null, teamId: 7 },
    ], team)).toBe(true);
  });

  it("não concede Super Administrador por papel restrito ou global malformado", () => {
    const restricted = [{ roleCode: "super_administrador", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null }] as const;
    const malformedGlobal = [{ roleCode: "super_administrador", defaultScope: "global", organizationId: 10, organizationalUnitId: null, teamId: null }] as const;
    const canonicalGlobal = [{ roleCode: "super_administrador", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null }] as const;
    expect(hasSuperAdministratorAssignment(restricted as any)).toBe(false);
    expect(hasSuperAdministratorAssignment(malformedGlobal as any)).toBe(false);
    expect(hasSuperAdministratorAssignment(canonicalGlobal as any)).toBe(true);
  });

  it("não amplia aprovação por tenant quando o administrador é de uma unidade", () => {
    const unitAdmin = [{ roleCode: "administrador", defaultScope: "unidade", organizationId: 10, organizationalUnitId: 20, teamId: null }] as const;
    const malformedOrgAdmin = [{ roleCode: "administrador", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: 20, teamId: null }] as const;
    const canonicalOrgAdmin = [{ roleCode: "administrador", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null }] as const;
    expect(hasAdministratorAssignmentForOrganization(unitAdmin as any, 10)).toBe(false);
    expect(hasAdministratorAssignmentForOrganization(malformedOrgAdmin as any, 10)).toBe(false);
    expect(hasAdministratorAssignmentForOrganization(canonicalOrgAdmin as any, 10)).toBe(true);
  });

  it("não permite que escopo global atravesse a empresa ativa", () => {
    const globalAssignment = [{ roleCode: "administrador", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null }] as const;
    const sameTenantTeam = { id: 7, organizationId: 10, organizationalUnitId: 20 };
    const otherTenantTeam = { id: 8, organizationId: 11, organizationalUnitId: 21 };
    expect((evaluateTeamScope as any)(globalAssignment, sameTenantTeam, 10)).toBe(true);
    expect((evaluateTeamScope as any)(globalAssignment, otherTenantTeam, 10)).toBe(false);
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

  it("limita aprovação dinâmica de integração ao tenant autorizado", () => {
    const globalAdmin = [{ roleCode: "administrador", defaultScope: "global", organizationId: null, organizationalUnitId: null, teamId: null }] as const;
    const tenantAdmin = [{ roleCode: "administrador", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null }] as const;
    const otherTenantAdmin = [{ roleCode: "administrador", defaultScope: "organizacao", organizationId: 11, organizationalUnitId: null, teamId: null }] as const;
    const supervisor = [{ roleCode: "supervisor", defaultScope: "organizacao", organizationId: 10, organizationalUnitId: null, teamId: null }] as const;

    expect(hasAdministratorAssignmentForOrganization(globalAdmin as any, 10)).toBe(true);
    expect(hasAdministratorAssignmentForOrganization(tenantAdmin as any, 10)).toBe(true);
    expect(hasAdministratorAssignmentForOrganization(otherTenantAdmin as any, 10)).toBe(false);
    expect(hasAdministratorAssignmentForOrganization(supervisor as any, 10)).toBe(false);
    expect(hasAdministratorAssignmentForOrganization(tenantAdmin as any, 0)).toBe(false);
  });

  it("não trata assignment global malformado como acesso global", () => {
    const malformedGlobal = [{ roleCode: "administrador", defaultScope: "global", organizationId: 10, organizationalUnitId: null, teamId: null }] as const;
    const team = { id: 7, organizationId: 10, organizationalUnitId: 20 };

    expect(evaluateTeamScope(malformedGlobal as any, team)).toBe(false);
    expect(requiresExplicitTeamSelection(malformedGlobal as any)).toBe(true);
    expect(hasAdministratorAssignmentForOrganization(malformedGlobal as any, 10)).toBe(false);
  });

});
