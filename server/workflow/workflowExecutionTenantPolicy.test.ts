import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const persistenceSource = readFileSync(new URL("./workflowInstancePersistence.ts", import.meta.url), "utf8");

describe("D-012E execução com tenant congelado", () => {
  it("persiste o tenant da execução e exige organizationId nas transições", () => {
    expect(persistenceSource).toContain("workflowExecutionTenantScopes");
    expect(persistenceSource).toMatch(/startManualWorkflowInstance\(input:\s*\{[\s\S]*?organizationId:\s*number/);
    expect(persistenceSource).toMatch(/insert\(workflowExecutionTenantScopes\)/);
    expect(persistenceSource).toMatch(/loadFrozenInstanceForTransition\([\s\S]*?organizationId:\s*number/);
    expect(persistenceSource).toMatch(/advanceManualWorkflowInstance\(input:\s*\{[\s\S]*?organizationId:\s*number/);
    expect(persistenceSource).toMatch(/resumeManualWorkflowInstanceFromCompletedTask\(input:\s*\{[\s\S]*?organizationId:\s*number/);
    expect(persistenceSource).toMatch(/cancelManualWorkflowInstance\(input:\s*\{[\s\S]*?organizationId:\s*number/);
  });
});
