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
      { findTeamOrganizationId, findAuthorizedOrganizationIds },
    )).resolves.toBe(77);
    expect(findTeamOrganizationId).not.toHaveBeenCalled();
    expect(findAuthorizedOrganizationIds).toHaveBeenCalledWith(9);
  });

  it("resolve explicitamente uma organização autorizada quando o usuário possui mais de um tenant", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    const findAuthorizedOrganizationIds = vi.fn(async () => [77, 88]);
    await expect(resolveFormTenantId(
      { userId: 9, teamId: null, selectedTenantId: 88 },
      { findTeamOrganizationId, findAuthorizedOrganizationIds },
    )).resolves.toBe(88);
  });

  it("mantém a empresa ativa autorizada mesmo quando o usuário possui equipe em outra empresa", async () => {
    const findTeamOrganizationId = vi.fn(async () => 77);
    const findAuthorizedOrganizationIds = vi.fn(async () => [77, 88]);
    await expect(resolveFormTenantId(
      { userId: 9, teamId: 3, selectedTenantId: 88 },
      { findTeamOrganizationId, findAuthorizedOrganizationIds },
    )).resolves.toBe(88);
    expect(findTeamOrganizationId).not.toHaveBeenCalled();
  });

  it("rejeita seleção explícita de organização fora do escopo autorizado", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    const findAuthorizedOrganizationIds = vi.fn(async () => [77, 88]);
    await expect(resolveFormTenantId(
      { userId: 9, teamId: null, selectedTenantId: 99 },
      { findTeamOrganizationId, findAuthorizedOrganizationIds },
    )).rejects.toBeInstanceOf(FormTenantResolutionError);
  });

  it("falha fechado quando usuário sem equipe não possui organização autorizada", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    const findAuthorizedOrganizationIds = vi.fn(async () => []);
    await expect(resolveFormTenantId(
      { userId: 9, teamId: null },
      { findTeamOrganizationId, findAuthorizedOrganizationIds },
    )).rejects.toBeInstanceOf(FormTenantResolutionError);
  });

  it("falha fechado quando usuário sem equipe possui mais de uma organização autorizada", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    const findAuthorizedOrganizationIds = vi.fn(async () => [77, 88]);
    await expect(resolveFormTenantId(
      { userId: 9, teamId: null },
      { findTeamOrganizationId, findAuthorizedOrganizationIds },
    )).rejects.toThrow(/selecion|organiza|tenant/i);
  });

  it("falha fechado quando equipe não está associada a organização", async () => {
    const findTeamOrganizationId = vi.fn(async () => null);
    await expect(resolveFormTenantId({ userId: 9, teamId: 3 }, { findTeamOrganizationId })).rejects.toThrow(/organiza|tenant/i);
  });
});
