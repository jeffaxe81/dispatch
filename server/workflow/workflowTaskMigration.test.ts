import { describe, expect, it } from "vitest";

const loadMigration = () => import("../../drizzle/0011_d012d_workflow_tasks.sql?raw");
const loadJournal = () => import("../../drizzle/meta/_journal.json?raw");
const loadDrizzleConfig = () => import("../../drizzle.config.ts?raw");

describe("D-012D workflow task migration contract", () => {
  it("cria workflow_tasks de forma aditiva com constraints e indices esperados", async () => {
    const { default: migration } = await loadMigration();

    expect(migration).toContain("CREATE TABLE `workflow_tasks`");
    expect(migration).toContain("`execution_id` int NOT NULL");
    expect(migration).toContain("`workflow_version_id` int NOT NULL");
    expect(migration).toContain("`node_id` varchar(120) NOT NULL");
    expect(migration).toContain("workflow_tasks_execution_node_unique");
    expect(migration).toContain("workflow_tasks_assignee_status_idx");
    expect(migration).toContain("workflow_tasks_execution_status_idx");
    expect(migration).toContain("REFERENCES `workflow_executions`(`id`)");
    expect(migration).toContain("REFERENCES `workflow_versions`(`id`)");
    expect(migration).toContain("REFERENCES `users`(`id`)");
    expect(migration).not.toContain("DROP ");
    expect(migration).not.toContain("DELETE FROM");
    expect(migration).not.toContain("ALTER TABLE `incidents`");
  });

  it("mantém 0011 registrada no journal do Drizzle mesmo com migrations posteriores", async () => {
    const { default: rawJournal } = await loadJournal();
    const journal = JSON.parse(rawJournal) as { entries: Array<{ idx: number; tag: string }> };
    expect(journal.entries).toContainEqual(expect.objectContaining({ idx: 11, tag: "0011_d012d_workflow_tasks" }));
  });

  it("mantem o schema D-012D visivel para o drizzle-kit", async () => {
    const { default: config } = await loadDrizzleConfig();
    expect(config).toContain('"./server/workflow/workflowTaskSchema.ts"');
  });
});