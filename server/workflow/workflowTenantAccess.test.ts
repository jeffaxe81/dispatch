import { describe, expect, it, vi } from "vitest";
import {
  assertWorkflowTenant,
  createWorkflowTenantScope,
  getWorkflowTenant,
} from "./workflowTenantAccess";

const loadWorkflowPersistence = () => import("./workflowPersistence.ts?raw");

function txWithTenant(organizationId: number | null) {
  const limit = vi.fn(async () => organizationId === null ? [] : [{ organizationId }]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const values = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values }));

  return { tx: { select, insert } as any, values };
}

describe("D-012E workflow tenant access", () => {
  it("resolve e permite workflow do mesmo tenant", async () => {
    const { tx } = txWithTenant(10);

    await expect(getWorkflowTenant(tx, 5)).resolves.toBe(10);
    await expect(assertWorkflowTenant(tx, 5, 10)).resolves.toBe(10);
  });

  it("nega acesso cruzado entre organizações", async () => {
    const { tx } = txWithTenant(10);

    await expect(assertWorkflowTenant(tx, 5, 11)).rejects.toThrow(/outra organização|tenant/i);
  });

  it("falha fechado quando o workflow ainda não possui escopo formal", async () => {
    const { tx } = txWithTenant(null);

    await expect(assertWorkflowTenant(tx, 6, 10)).rejects.toThrow(/sem escopo|tenant/i);
  });

  it("persiste o tenant explícito no vínculo do workflow", async () => {
    const { tx, values } = txWithTenant(null);

    await expect(createWorkflowTenantScope(tx, 7, 10)).resolves.toEqual({ workflowId: 7, organizationId: 10 });
    expect(values).toHaveBeenCalledWith({ workflowId: 7, organizationId: 10 });
  });

  it("exige organizationId e valida tenant antes de ler publicação/versão", async () => {
    const { default: persistence } = await loadWorkflowPersistence();
    const signature = persistence.indexOf("workflowId: number; organizationId: number; active: boolean; actorUserId: number");
    const guard = persistence.indexOf("await assertWorkflowTenant(tx, input.workflowId, input.organizationId)");
    const publicationRead = persistence.indexOf("const pointer =");

    expect(signature).toBeGreaterThan(-1);
    expect(persistence).toContain('import { assertWorkflowTenant } from "./workflowTenantAccess"');
    expect(guard).toBeGreaterThan(-1);
    expect(publicationRead).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(publicationRead);
  });
});
