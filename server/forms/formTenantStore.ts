export type TeamTenantSnapshot = { id: number; organizationId: number | null };
export type FormTenantStorePorts = { findTeamById(teamId: number): Promise<TeamTenantSnapshot | null> };

export function createFormTenantStore(ports: FormTenantStorePorts) {
  return {
    async findTeamOrganizationId(teamId: number): Promise<number | null> {
      const team = await ports.findTeamById(teamId);
      return team?.organizationId ?? null;
    },
  };
}

export type FormTenantStore = ReturnType<typeof createFormTenantStore>;
