import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessRoles, userRoleAssignments, users } from "../../drizzle/schema";
import { setDbForTesting } from "../dbLegacy";
import { workflowTasks } from "./workflowTaskSchema";
import { workflowExecutionTenantScopes } from "./workflowTenantScopeSchema";

const policyModule = "./workflowTaskTenantPolicy";
const loadPolicySource = () => import("./workflowTaskTenantPolicy.ts?raw");

type Policy = {
  assertTaskTenant: (tx: any, taskId: number, organizationId: number) => Promise<number>;
  assertAssigneeAuthorizedForTenant: (userId: number, organizationId: number) => Promise<number>;
};

async function loadPolicy(): Promise<Policy> {
  return await import(policyModule) as unknown as Policy;
}

function taskTx(input: { executionId?: number | null; organizationId?: number | null }) {
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: async () => {
          if (table === workflowTasks) return input.executionId ? [{ executionId: input.executionId }] : [];
          if (table === workflowExecutionTenantScopes) return input.organizationId ? [{ organizationId: input.organizationId }] : [];
          return [];
        },
      }),
    }),
  }));
  return { select } as any;
}

function assigneeDb(input: { active?: boolean; assignments?: Array<{ organizationId: number | null; defaultScope: string }> }) {
  const assignments = input.assignments ?? [];
  return {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        if (table === users) {
          return { where: () => ({ limit: async () => input.active === false ? [{ id: 42, active: false }] : [{ id: 42, active: true }] }) };
        }
        if (table === userRoleAssignments) {
          return {
            innerJoin: (joined: unknown) => {
              expect(joined).toBe(accessRoles);
              return { where: async () => assignments };
            },
          };
        }
        throw new Error("Tabela inesperada no teste de assignee tenant.");
      },
    })),
  };
}

let originalNodeEnv: string | undefined;
beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
});
afterEach(() => {
  setDbForTesting(null);
  process.env.NODE_ENV = originalNodeEnv;
});

describe("D-012E tenant policy for workflow tasks", () => {
  it("permite tarefa vinculada a execução do mesmo tenant", async () => {
    const { assertTaskTenant } = await loadPolicy();
    await expect(assertTaskTenant(taskTx({ executionId: 5, organizationId: 10 }), 100, 10)).resolves.toBe(10);
  });

  it("nega tarefa de outro tenant e falha fechado quando o scope está ausente", async () => {
    const { assertTaskTenant } = await loadPolicy();
    await expect(assertTaskTenant(taskTx({ executionId: 5, organizationId: 10 }), 100, 20)).rejects.toThrow(/tenant|organização/i);
    await expect(assertTaskTenant(taskTx({ executionId: 5, organizationId: null }), 100, 10)).rejects.toThrow(/sem escopo|tenant/i);
  });

  it("autoriza responsável com assignment organizacional válido", async () => {
    setDbForTesting(assigneeDb({ assignments: [{ organizationId: 10, defaultScope: "organizacao" }] }) as never);
    const { assertAssigneeAuthorizedForTenant } = await loadPolicy();
    await expect(assertAssigneeAuthorizedForTenant(42, 10)).resolves.toBe(42);
  });

  it("autoriza assignment global sem depender do nome do papel", async () => {
    setDbForTesting(assigneeDb({ assignments: [{ organizationId: null, defaultScope: "global" }] }) as never);
    const { assertAssigneeAuthorizedForTenant } = await loadPolicy();
    await expect(assertAssigneeAuthorizedForTenant(42, 10)).resolves.toBe(42);
  });

  it("nega responsável sem assignment para o tenant ou usuário inativo", async () => {
    const { assertAssigneeAuthorizedForTenant } = await loadPolicy();

    setDbForTesting(assigneeDb({ assignments: [{ organizationId: 20, defaultScope: "organizacao" }] }) as never);
    await expect(assertAssigneeAuthorizedForTenant(42, 10)).rejects.toThrow(/não.*autorizad|tenant/i);

    setDbForTesting(assigneeDb({ active: false, assignments: [{ organizationId: 10, defaultScope: "organizacao" }] }) as never);
    await expect(assertAssigneeAuthorizedForTenant(42, 10)).rejects.toThrow(/inativ|não.*autorizad/i);
  });

  it("aplica a mesma regra de expiração usada pelo RBAC dinâmico", async () => {
    const { default: source } = await loadPolicySource();
    expect(source).toContain("userRoleAssignments.expiresAt");
    expect(source).toContain("isNull(userRoleAssignments.expiresAt)");
    expect(source).toContain("gt(userRoleAssignments.expiresAt, new Date())");
  });
});
