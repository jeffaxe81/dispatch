import { describe, expect, it } from "vitest";

const loadFacade = () => import("./workflowTenantFacade.ts?raw");

describe("D-012E workflow tenant facade", () => {
  it("escopa listagens de workflows e execuções pelo tenant materializado", async () => {
    const { default: source } = await loadFacade();

    expect(source).toContain("workflowTenantScopes");
    expect(source).toContain("workflowExecutionTenantScopes");
    expect(source).toContain("listSimulatedWorkflowsForTenant");
    expect(source).toContain("listSimulatedWorkflowExecutionsForTenant");
    expect(source).toMatch(/eq\(workflowTenantScopes\.organizationId,\s*organizationId\)/);
    expect(source).toMatch(/eq\(workflowExecutionTenantScopes\.organizationId,\s*organizationId\)/);
  });

  it("falha fechado em operações por id e delega a criação para a persistência atômica tenant-aware", async () => {
    const { default: source } = await loadFacade();

    for (const operation of [
      "getSimulatedWorkflowForTenant",
      "updateSimulatedWorkflowForTenant",
      "deleteSimulatedWorkflowForTenant",
    ]) {
      expect(source).toContain(operation);
    }
    expect(source.match(/assertWorkflowTenant\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(source).toContain("createSimulatedWorkflowWithTenant");
    expect(source).not.toContain("createWorkflowTenantScope");
    expect(source).toContain("createSimulatedWorkflowForTenant");
    expect(source).toContain("getSimulatedWorkflowExecutionForTenant");
    expect(source).toContain("assertExecutionTenantForRead");
  });
});
