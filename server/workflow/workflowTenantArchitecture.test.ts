import { describe, expect, it } from "vitest";

const loadInstancePersistence = () => import("./workflowInstancePersistence.ts?raw");
const loadTaskPersistence = () => import("./workflowTaskPersistence.ts?raw");
const loadTaskSchema = () => import("./workflowTaskSchema.ts?raw");
const loadCentralContract = () => import("../rbac/centralRbacContract.ts?raw");
const loadMigration = () => import("../../drizzle/0012_d012e_workflow_tenant_rbac.sql?raw");

describe("D-012E tenant and RBAC architectural invariants", () => {
  it("freezes execution tenant and guards human-task mutations", async () => {
    const [{ default: instances }, { default: tasks }] = await Promise.all([
      loadInstancePersistence(),
      loadTaskPersistence(),
    ]);

    expect(instances).toContain("workflowExecutionTenantScopes");
    expect(tasks).toContain("assertTaskTenant");
    expect(tasks).toContain("assertAssigneeAuthorizedForTenant");
  });

  it("keeps tenant ownership out of workflow_tasks and inherited through executions", async () => {
    const [{ default: taskSchema }, { default: migration }] = await Promise.all([
      loadTaskSchema(),
      loadMigration(),
    ]);

    expect(taskSchema).not.toContain("organizationId");
    expect(taskSchema).not.toContain("organization_id");
    expect(migration).toContain("workflow_execution_tenant_scopes");
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+`?workflow_tasks`?/i);
  });

  it("keeps future central RBAC boundary provider-neutral and transport-free", async () => {
    const { default: centralContract } = await loadCentralContract();

    expect(centralContract).toContain("CentralRbacProvider");
    expect(centralContract).not.toMatch(/SCIM|LDAP|OIDC|axios|fetch\s*\(|webhook|polling/i);
  });
});
