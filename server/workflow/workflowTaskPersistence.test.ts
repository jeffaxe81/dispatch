import { describe, expect, it } from "vitest";

const loadPersistence = () => import("./workflowTaskPersistence.ts?raw");
const loadInstancePersistence = () => import("./workflowInstancePersistence.ts?raw");

describe("D-012D workflow task persistence", () => {
  it("mantem mutacoes publicas transacionais, bloqueadas e auditadas", async () => {
    const { default: source } = await loadPersistence();

    expect(source).toContain("db.transaction");
    expect(source).toContain("workflowTasks");
    expect(source).toContain('for("update")');
    expect(source).toContain("auditLogs");
    expect(source).toContain('resourceType: "workflow_task"');
    expect(source).not.toContain("createWorkflowTask");
    expect(source).not.toContain("cancelWorkflowTask");
    expect(source).not.toContain("currentVersion");
    expect(source).not.toContain("incidents");
  });

  it("mantem a criacao de tarefa dentro da transacao da instancia e usa a versao congelada", async () => {
    const { default: source } = await loadInstancePersistence();

    expect(source).toContain("ensureWorkflowTaskForNode");
    expect(source).toContain("workflowVersionId: frozen.state.workflowVersionId");
    expect(source).toContain("workflowTasks");
    expect(source).not.toContain("currentVersion");
  });
});
