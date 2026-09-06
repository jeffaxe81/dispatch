import { describe, expect, it, vi } from "vitest";
import { resolveFormTenantId, FormTenantResolutionError } from "./formTenantResolver";

describe("D-008 authenticated tenant resolution", () => {
  it("resolve organização pela equipe do usuário autenticado", async () => {
    const findTeamOrganizationId = vi.fn(async () => 77);
    await expect(resolveFormTenantId({ userId: 9, teamId: 3 }, { findTeamOrganizationId })).resolves.toBe(77);
    expect(findTeamOrganizationId).toHaveBeenCalledWith(3);
  });

  it("resolve administrador sem equipe quando existe exatamente uma organização autorizada", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    const findAuthorizedOrganizationIds = vi.fn(async () => [77]);
    await expect(resolveFormTenantId(
      { userId: 9, teamId: null },
      { findTeamOrganizationId, findAuthorizedOrganizationIds } as any,
    )).resolves.toBe(77);
    expect(findTeamOrganizationId).not.toHaveBeenCalled();
    expect(findAuthorizedOrganizationIds).toHaveBeenCalledWith(9);
  });

  it("falha fechado quando usuário sem equipe não possui organização autorizada", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    const findAuthorizedOrganizationIds = vi.fn(async () => []);
    await expect(resolveFormTenantId(
      { userId: 9, teamId: null },
      { findTeamOrganizationId, findAuthorizedOrganizationIds } as any,
    )).rejects.toBeInstanceOf(FormTenantResolutionError);
  });

  it("falha fechado quando usuário sem equipe possui mais de uma organização autorizada", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    const findAuthorizedOrganizationIds = vi.fn(async () => [77, 88]);
    await expect(resolveFormTenantId(
      { userId: 9, teamId: null },
      { findTeamOrganizationId, findAuthorizedOrganizationIds } as any,
    )).rejects.toThrow(/selecion|organiza|tenant/i);
  });

  it("falha fechado quando equipe não está associada a organização", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    await expect(resolveFormTenantId({ userId: 9, teamId: 3 }, { findTeamOrganizationId })).rejects.toThrow(/organiza|tenant/i);
  });
});
