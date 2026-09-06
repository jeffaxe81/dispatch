import { describe, expect, it, vi } from "vitest";
import { resolveFormTenantId, FormTenantResolutionError } from "./formTenantResolver";

describe("D-008 authenticated tenant resolution", () => {
  it("resolve organização pela equipe do usuário autenticado", async () => {
    const findTeamOrganizationId = vi.fn(async () => 77);
    await expect(resolveFormTenantId({ userId: 9, teamId: 3 }, { findTeamOrganizationId })).resolves.toBe(77);
    expect(findTeamOrganizationId).toHaveBeenCalledWith(3);
  });

  it("falha fechado quando usuário não possui equipe/organização resolvível", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    await expect(resolveFormTenantId({ userId: 9, teamId: null }, { findTeamOrganizationId })).rejects.toBeInstanceOf(FormTenantResolutionError);
    expect(findTeamOrganizationId).not.toHaveBeenCalled();
  });

  it("falha fechado quando equipe não está associada a organização", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    await expect(resolveFormTenantId({ userId: 9, teamId: 3 }, { findTeamOrganizationId })).rejects.toThrow(/organiza|tenant/i);
  });
});
