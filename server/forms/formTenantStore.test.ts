import { describe, expect, it, vi } from "vitest";
import { createFormTenantStore } from "./formTenantStore";

describe("D-008 tenant store", () => {
  it("retorna organizationId da equipe", async () => {
    const findTeamById = vi.fn(async () => ({ id: 3, organizationId: 77 }));
    const store = createFormTenantStore({ findTeamById });
    await expect(store.findTeamOrganizationId(3)).resolves.toBe(77);
    expect(findTeamById).toHaveBeenCalledWith(3);
  });

  it("retorna null para equipe inexistente ou sem organização", async () => {
    const missing = createFormTenantStore({ findTeamById: vi.fn(async () => null) });
    await expect(missing.findTeamOrganizationId(3)).resolves.toBeNull();
    const unscoped = createFormTenantStore({ findTeamById: vi.fn(async () => ({ id: 3, organizationId: null })) });
    await expect(unscoped.findTeamOrganizationId(3)).resolves.toBeNull();
  });
});
