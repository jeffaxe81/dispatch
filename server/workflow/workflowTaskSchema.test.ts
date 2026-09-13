import { describe, expect, it } from "vitest";

const loadSchema = () => import("./workflowTaskSchema.ts?raw");

describe("D-012D workflow task schema", () => {
  it("define workflow_tasks em modulo proprio sem criar workflow_instances", async () => {
    const { default: source } = await loadSchema();
    expect(source).toContain('mysqlTable("workflow_tasks"');
    expect(source).toContain("workflowTaskStatusEnum");
    expect(source).toContain("executionId");
    expect(source).toContain("workflowVersionId");
    expect(source).toContain("assigneeUserId");
    expect(source).toContain("workflow_tasks_execution_node_unique");
    expect(source).not.toContain('mysqlTable("workflow_instances"');
  });
});
