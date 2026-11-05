export function canUpdateRoleDefinition(input: { isSystem: boolean; permissionIdsProvided: boolean; active?: boolean }) {
  if (!input.isSystem) return true;
  if (input.permissionIdsProvided) return false;
  if (input.active !== undefined) return false;
  return true;
}

type RoleScopeAssignmentInput = {
  defaultScope: "global" | "organizacao" | "unidade" | "departamento" | "grupo" | "equipe";
  organizationId?: number | null;
  organizationalUnitId?: number | null;
  teamId?: number | null;
};

function hasScopeValue(value: number | null | undefined) {
  return value !== null && value !== undefined;
}

export function isRoleScopeAssignmentValid(input: RoleScopeAssignmentInput) {
  const hasOrganization = hasScopeValue(input.organizationId);
  const hasUnit = hasScopeValue(input.organizationalUnitId);
  const hasTeam = hasScopeValue(input.teamId);

  if (input.defaultScope === "global") {
    return !hasOrganization && !hasUnit && !hasTeam;
  }
  if (input.defaultScope === "organizacao") {
    return hasOrganization && !hasUnit && !hasTeam;
  }
  if (["unidade", "departamento", "grupo"].includes(input.defaultScope)) {
    return hasOrganization && hasUnit && !hasTeam;
  }
  return hasTeam && !hasOrganization && !hasUnit;
}
