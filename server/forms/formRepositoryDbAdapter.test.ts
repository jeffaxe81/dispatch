import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createFormRepositoryDbAdapter } from "./formRepositoryDbAdapter";

function chain(rows: unknown[] = []) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

  it("grava SHA-256 determinístico da revisão e nunca placeholder", async () => {
    const returning = vi.fn(async () => [{ id: 31 }]);
    const revisionValues = vi.fn(() => ({ $returningId: returning }));
    const insert = vi.fn(() => ({ values: revisionValues }));
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const adapter = createFormRepositoryDbAdapter({ getDb: async () => ({ insert, update }) } as any);
    const answers = { notes: "Depois", nested: { ok: true } };
    await adapter.appendRevision({ tenantId: 7, submissionId: 21, revision: 2, answers, reason: "Correção", actorUserId: 9, submissionStatus: "corrected" });
    expect(revisionValues).toHaveBeenCalledWith(expect.objectContaining({ afterHash: sha256(answers) }));
    expect(revisionValues.mock.calls[0]?.[0]?.afterHash).toMatch(/^[a-f0-9]{64}$/);
    expect(revisionValues.mock.calls[0]?.[0]?.afterHash).not.toContain("pending");
  });

  it("não oferece operação de exclusão física", () => {
    const adapter = createFormRepositoryDbAdapter({ getDb: async () => null } as any);
    expect("deleteForm" in adapter).toBe(false);
  });
});
