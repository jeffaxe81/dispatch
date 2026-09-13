import { describe, expect, it } from "vitest";

const loadSchema = () => import("./workflowTaskSchema.ts?raw");
const loadMigration = () => import("../../drizzle/0011_d012d_workflow_tasks.sql?raw");
const loadJournal = () => import("../../drizzle/meta/_journal.json?raw");

describe("D-012D workflow task persistence contract", () => {
  it("define tarefas e histórico em tabelas próprias do módulo", async () => {
    const { default: schema } = await loadSchema();

    expect(schema).toContain('mysqlTable(\n  "workflow_tasks"');
    expect(schema).toContain('mysqlTable(\n  "workflow_task_events"');
    expect(schema).toContain('uniqueIndex("workflow_tasks_execution_node_unique")');
    expect(schema).toContain('index("workflow_tasks_status_idx")');
    expect(schema).toContain('index("workflow_tasks_assignment_idx")');
    expect(schema).toContain('index("workflow_task_events_task_created_idx")');
  });

  it("mantém 0011 aditiva e sem acoplamento a ocorrências", async () => {
    const { default: migration } = await loadMigration();

    expect(migration).toContain("CREATE TABLE `workflow_tasks`");
    expect(migration).toContain("CREATE TABLE `workflow_task_events`");
    expect(migration).toContain("workflow_tasks_execution_node_unique");
    expect(migration).not.toContain("ALTER TABLE `incidents`");
    expect(migration).not.toContain("UPDATE `incidents`");
    expect(migration).not.toContain("DROP TABLE");
  });

  it("registra 0011 no journal do Drizzle", async () => {
    const { default: rawJournal } = await loadJournal();
    const journal = JSON.parse(rawJournal) as { entries: Array<{ idx: number; tag: string }> };
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 11,
      tag: "0011_d012d_workflow_tasks",
    });
  });
});
