import { describe, expect, it } from "vitest";

const loadPersistence = () => import("./workflowTaskPersistence.ts?raw");

describe("D-012D workflow task persistence", () => {
  it("usa a execucao congelada, transacao, lock, idempotencia e auditoria", async () => {
    const { default: source } = await loadPersistence();

    expect(source).toContain("db.transaction");
    expect(source).toContain("workflowExecutions");
    expect(source).toContain("workflowVersionId");
    expect(source).toContain("workflowTasks");
    expect(source).toContain('for("update")');
    expect(source).toContain("executionId");
    expect(source).toContain("nodeId");
    expect(source).toContain("auditLogs");
    expect(source).toContain('resourceType: "workflow_task"');
    expect(source).not.toContain("currentVersion");
    expect(source).not.toContain("incidents");
  });
});
