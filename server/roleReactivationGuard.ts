import { isRoleScopeAssignmentValid, type RoleScopeAssignment } from "./accessPolicies";
import {
  isReservedHomologationCode,
  validateHomologationRoleAssignment,
} from "../shared/homologationProfiles";

/** R009: Re-activation is a NEW grant, never an escape from QA expiry. */
export type RoleReactivationInput = RoleScopeAssignment & {
  activate: boolean;
  roleCode: string;
  roleActive: boolean;
  expiresAt?: Date | null;
  userIsBaseAdmin: boolean;
  stage: unknown;
  qaEnabled: unknown;
  teamOrganizationId?: number | null;
};

export function assertRoleReactivationAllowed(
  input: RoleReactivationInput,
  now = new Date(),
): void {
  // Revocation must remain possible even for expired or malformed grants.
  if (!input.activate) return;
  if (!input.roleActive || !isRoleScopeAssignmentValid(input))
    throw new Error("Não é possível reativar perfil inativo ou com escopo inválido.");
  if (!Number.isFinite(now.getTime()))
    throw new Error("Relógio de reativação inválido.");
  if (input.expiresAt !== null && input.expiresAt !== undefined &&
    (!(input.expiresAt instanceof Date) || !Number.isFinite(input.expiresAt.getTime()) ||
      input.expiresAt.getTime() <= now.getTime()))
    throw new Error("O prazo deste perfil terminou; crie nova atribuição.");

  if (!isReservedHomologationCode(input.roleCode)) return;

  // Original QA scope must never be upgraded or made indefinite via toggle.
  if (input.organizationalUnitId != null ||
    (input.defaultScope === "organizacao" && input.teamId != null) ||
    (input.defaultScope === "equipe" &&
      (input.teamId == null || input.teamOrganizationId !== input.organizationId))) {
    throw new Error("Escopo de homologação inconsistente; crie nova atribuição.");
  }

  if (!validateHomologationRoleAssignment({
    code: input.roleCode,
    stage: input.stage,
    enabled: input.qaEnabled,
    userIsBaseAdmin: input.userIsBaseAdmin,
    organizationId: input.organizationId,
    teamId: input.teamId,
    expiresAt: input.expiresAt,
  }, now)) {
    throw new Error("Reativação QA não permitida. Verifique validade, ambiente e escopo.");
  }
}
