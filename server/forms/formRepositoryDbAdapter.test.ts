import { describe, expect, it, vi } from "vitest";
import { createFormRepositoryDbAdapter } from "./formRepositoryDbAdapter";

function chain(rows: unknown[] = []) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
}

describe("D-008 Drizzle repository adapter", () => {
  it("falha fechado quando o banco está indisponível", async () => {
    const adapter = createFormRepositoryDbAdapter({ getDb: async () => null } as any);
    await expect(adapter.getTemplate({ tenantId: 7, id: 3 })).rejects.toThrow(/banco/i);
  });

  it("busca template limitado ao tenant e a um registro", async () => {
    const q = chain([{ id: 3, tenantId: 7, status: "active" }]);
    const adapter = createFormRepositoryDbAdapter({ getDb: async () => ({ select: q.select }) } as any);
    const result = await adapter.getTemplate({ tenantId: 7, id: 3 });
    expect(result).toEqual(expect.objectContaining({ id: 3, tenantId: 7, status: "active" }));
    expect(q.limit).toHaveBeenCalledWith(1);
  });

  it("persiste binding com tenant do repository", async () => {
    const returning = vi.fn(async () => [{ id: 10 }]);
    const values = vi.fn(() => ({ $returningId: returning }));
    const insert = vi.fn(() => ({ values }));
    const adapter = createFormRepositoryDbAdapter({ getDb: async () => ({ insert }) } as any);
    await adapter.createBinding({ tenantId: 7, formId: 3, formVersionId: 5, contextType: "incident", contextId: "42", createdByUserId: 9 });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7, formId: 3, formVersionId: 5, contextType: "incident" }));
  });

  it("não oferece operação de exclusão física", () => {
    const adapter = createFormRepositoryDbAdapter({ getDb: async () => null } as any);
    expect("deleteForm" in adapter).toBe(false);
  });
});
