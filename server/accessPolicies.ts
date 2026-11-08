export function canUpdateRoleDefinition(input: { isSystem: boolean; permissionIdsProvided: boolean; defaultScopeProvided?: boolean; active?: boolean }) {
  if (!input.isSystem) return true;
  if (input.permissionIdsProvided || input.defaultScopeProvided) return false;
  if (input.active !== undefined) return false;
  return true;
}

export type RoleScopeAssignment = {
  defaultScope: "global" | "organizacao" | "unidade" | "departamento" | "grupo" | "equipe";
  organizationId?: number | null;
  organizationalUnitId?: number | null;
  teamId?: number | null;
};

/**
 * A global grant is valid only if ALL subordinate identifiers are absent.
 * Malformed records must never be promoted to unrestricted access merely
 * because their defaultScope says "global".
 */
export function isCanonicalGlobalScope(input: RoleScopeAssignment): boolean {
  return input.defaultScope === "global" &&
    input.organizationId == null &&
    input.organizationalUnitId == null &&
    input.teamId == null;
}

export function isRoleScopeAssignmentValid(input: RoleScopeAssignment) {
  if (input.defaultScope === "global") return isCanonicalGlobalScope(input);
  if (input.defaultScope === "organizacao") return input.organizationId !== null && input.organizationId !== undefined;
  if (["unidade", "departamento", "grupo"].includes(input.defaultScope)) return input.organizationId !== null && input.organizationId !== undefined && input.organizationalUnitId !== null && input.organizationalUnitId !== undefined;
  return input.teamId !== null && input.teamId !== undefined;
}
