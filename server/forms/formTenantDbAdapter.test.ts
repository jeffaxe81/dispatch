import { describe, expect, it, vi } from "vitest";
import { createFormTenantDbAdapter } from "./formTenantDbAdapter";

describe("D-008 Drizzle tenant adapter", () => {
  it("consulta equipe por id e retorna somente escopo necessário", async () => {
    const limit = vi.fn(async () => [{ id: 3, organizationId: 77 }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const adapter = createFormTenantDbAdapter({ getDb: async () => ({ select } as any) });
    await expect(adapter.findTeamById(3)).resolves.toEqual({ id: 3, organizationId: 77 });
    expect(select).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("falha quando banco está indisponível", async () => {
    const adapter = createFormTenantDbAdapter({ getDb: async () => null });
    await expect(adapter.findTeamById(3)).rejects.toThrow(/banco/i);
  });
});
