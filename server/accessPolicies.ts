export function canUpdateRoleDefinition(input: { isSystem: boolean; permissionIdsProvided: boolean; active?: boolean }) {
  if (!input.isSystem) return true;
  if (input.permissionIdsProvided) return false;
  if (input.active !== undefined) return false;
  return true;
}

export function isRoleScopeAssignmentValid(input: { defaultScope: "global" | "organizacao" | "unidade" | "departamento" | "grupo" | "equipe"; organizationId?: number | null; organizationalUnitId?: number | null; teamId?: number | null }) {
  if (input.defaultScope === "global") return true;
  if (input.defaultScope === "organizacao") return input.organizationId !== null && input.organizationId !== undefined;
  if (["unidade", "departamento", "grupo"].includes(input.defaultScope)) return input.organizationId !== null && input.organizationId !== undefined && input.organizationalUnitId !== null && input.organizationalUnitId !== undefined;
  return input.teamId !== null && input.teamId !== undefined;
}
