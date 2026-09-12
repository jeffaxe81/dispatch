export class FormTenantResolutionError extends Error {
  readonly code = "FORM_TENANT_UNRESOLVED";
  constructor(message = "Não foi possível resolver a organização/tenant do usuário autenticado.") { super(message); this.name = "FormTenantResolutionError"; }
}

export type FormTenantUser = {
  userId: number;
  teamId: number | null | undefined;
  selectedTenantId?: number | null;
};
export type FormTenantResolverPorts = {
  findTeamOrganizationId(teamId: number): Promise<number | null | undefined>;
  findAuthorizedOrganizationIds?(userId: number): Promise<number[]>;
};

export async function resolveFormTenantId(user: FormTenantUser, ports: FormTenantResolverPorts): Promise<number> {
  const selectedTenantId = user.selectedTenantId;
  if (selectedTenantId !== undefined && selectedTenantId !== null && (!Number.isInteger(selectedTenantId) || selectedTenantId <= 0)) {
    throw new FormTenantResolutionError("A organização/tenant selecionada é inválida.");
  }

  if (user.teamId) {
    const organizationId = await ports.findTeamOrganizationId(user.teamId);
    if (!organizationId) throw new FormTenantResolutionError("A equipe do usuário autenticado não está associada a uma organização/tenant.");
    if (selectedTenantId && selectedTenantId !== organizationId) {
      throw new FormTenantResolutionError("A organização/tenant selecionada não corresponde à organização da equipe do usuário.");
    }
    return organizationId;
  }

  const organizationIds = Array.from(new Set((await ports.findAuthorizedOrganizationIds?.(user.userId) ?? [])
    .filter(organizationId => Number.isInteger(organizationId) && organizationId > 0)));

  if (selectedTenantId) {
    if (organizationIds.includes(selectedTenantId)) return selectedTenantId;
    throw new FormTenantResolutionError("A organização/tenant selecionada não está autorizada para o usuário autenticado.");
  }

  if (organizationIds.length === 1) return organizationIds[0];
  if (organizationIds.length > 1) {
    throw new FormTenantResolutionError("Selecione explicitamente uma organização/tenant autorizada para acessar formulários.");
  }
  throw new FormTenantResolutionError();
}
