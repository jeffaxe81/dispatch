import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const instancePersistenceSource = readFileSync(new URL("./workflowInstancePersistence.ts", import.meta.url), "utf8");
const legacyPersistenceSource = readFileSync(new URL("./workflowExecutionPersistence.ts", import.meta.url), "utf8");

describe("D-012E execução com tenant congelado", () => {
  it("persiste o tenant da execução manual e exige organizationId nas transições", () => {
    expect(instancePersistenceSource).toContain("workflowExecutionTenantScopes");
    expect(instancePersistenceSource).toMatch(/startManualWorkflowInstance\(input:\s*\{[\s\S]*?organizationId:\s*number/);
    expect(instancePersistenceSource).toMatch(/insert\(workflowExecutionTenantScopes\)/);
    expect(instancePersistenceSource).toMatch(/loadFrozenInstanceForTransition\([\s\S]*?organizationId:\s*number/);
    expect(instancePersistenceSource).toMatch(/advanceManualWorkflowInstance\(input:\s*\{[\s\S]*?organizationId:\s*number/);
    expect(instancePersistenceSource).toMatch(/resumeManualWorkflowInstanceFromCompletedTask\(input:\s*\{[\s\S]*?organizationId:\s*number/);
    expect(instancePersistenceSource).toMatch(/cancelManualWorkflowInstance\(input:\s*\{[\s\S]*?organizationId:\s*number/);
  });

  it("protege também execute/retry do executor legado e congela o tenant da execução criada", () => {
    expect(legacyPersistenceSource).toContain("workflowExecutionTenantScopes");
    expect(legacyPersistenceSource).toContain("assertWorkflowTenant");
    expect(legacyPersistenceSource).toMatch(/executeSimulatedWorkflow\(input:\s*\{[\s\S]*?organizationId:\s*number/);
    expect(legacyPersistenceSource).toMatch(/retrySimulatedWorkflowExecution\(input:\s*\{[\s\S]*?organizationId:\s*number/);
    expect(legacyPersistenceSource).toMatch(/insert\(workflowExecutionTenantScopes\)/);
    expect(legacyPersistenceSource).toMatch(/assertExecutionTenant\(tx,\s*input\.executionId,\s*input\.organizationId\)/);
  });
});
