export class FormTenantResolutionError extends Error {
  readonly code = "FORM_TENANT_UNRESOLVED";
  constructor(message = "Não foi possível resolver a organização/tenant do usuário autenticado.") { super(message); this.name = "FormTenantResolutionError"; }
}

export type FormTenantUser = { userId: number; teamId: number | null | undefined };
export type FormTenantResolverPorts = { findTeamOrganizationId(teamId: number): Promise<number | null | undefined> };

export async function resolveFormTenantId(user: FormTenantUser, ports: FormTenantResolverPorts): Promise<number> {
  if (!user.teamId) throw new FormTenantResolutionError();
  const organizationId = await ports.findTeamOrganizationId(user.teamId);
  if (!organizationId) throw new FormTenantResolutionError("A equipe do usuário autenticado não está associada a uma organização/tenant.");
  return organizationId;
}
