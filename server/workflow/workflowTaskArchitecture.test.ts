import { describe, expect, it } from "vitest";

const loadTaskPersistence = () => import("./workflowTaskPersistence.ts?raw");
const loadInstancePersistence = () => import("./workflowInstancePersistence.ts?raw");
const loadLegacyExecution = () => import("./workflowExecutionPersistence.ts?raw");
const loadTaskSchema = () => import("./workflowTaskSchema.ts?raw");
const loadFacade = () => import("../db.ts?raw");

describe("D-012D architecture boundaries", () => {
  it("keeps tasks as children of workflow_executions and does not create a second engine", async () => {
    const [{ default: tasks }, { default: instances }, { default: schema }] = await Promise.all([
      loadTaskPersistence(),
      loadInstancePersistence(),
      loadTaskSchema(),
    ]);

    expect(schema).toContain("mysqlTable(");
    expect(schema).toContain('\"workflow_tasks\",');
    expect(`${tasks}\n${instances}\n${schema}`).not.toContain('mysqlTable(\"workflow_instances\"');
    expect(instances).toContain("workflowTasks");
  });

  it("does not couple D-012D persistence to HTTP, incidents or external adapters", async () => {
    const [{ default: tasks }, { default: instances }] = await Promise.all([
      loadTaskPersistence(),
      loadInstancePersistence(),
    ]);
    const source = `${tasks}\n${instances}`;

    expect(source).not.toContain("express");
    expect(source).not.toContain("axios");
    expect(source).not.toContain("integrationConnections");
    expect(source).not.toContain("incidents");
    expect(source).not.toContain("externalRequests");
  });

  it("preserves the frozen workflow version and explicit human-task marker", async () => {
    const { default: instances } = await loadInstancePersistence();

    expect(instances).toContain("workflowVersionId: frozen.state.workflowVersionId");
    expect(instances).toContain("requiresHumanTask");
    expect(instances).toContain("resumeManualWorkflowInstanceFromCompletedTask");
    expect(instances).not.toContain("currentVersion");
  });

  it("forces human-task workflows away from the legacy simulator", async () => {
    const { default: legacy } = await loadLegacyExecution();
    expect(legacy).toContain("assertLegacyExecutorSupportsDefinition");
    expect(legacy).toContain("buildSimulatedExecutionPlan");
    expect(legacy.indexOf("assertLegacyExecutorSupportsDefinition(version.definition)")).toBeLessThan(
      legacy.indexOf("buildSimulatedExecutionPlan(version.definition"),
    );
  });

  it("exposes only safe task mutations and waiting resume through the existing facade", async () => {
    const { default: facade } = await loadFacade();
    for (const operation of [
      "assignWorkflowTask",
      "claimWorkflowTask",
      "startWorkflowTask",
      "completeWorkflowTask",
      "resumeManualWorkflowInstanceFromCompletedTask",
    ]) {
      expect(facade).toContain(operation);
    }
    expect(facade).not.toContain("createWorkflowTask");
    expect(facade).not.toContain("cancelWorkflowTask");
  });

  it("requires tenant scope on every public human-task mutation", async () => {
    const { default: tasks } = await loadTaskPersistence();

    expect(tasks).toContain("assertTaskTenant");
    expect(tasks).toContain("assertAssigneeAuthorizedForTenant");
    expect(tasks.match(/organizationId:\s*number/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(tasks.match(/assertTaskTenant\(tx, input\.taskId, input\.organizationId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
