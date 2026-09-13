import { describe, expect, it } from "vitest";

const loadSchema = () => import("../../drizzle/schema.ts?raw");
const loadMigration = () => import("../../drizzle/0010_d012c_workflow_instance_state.sql?raw");
const loadJournal = () => import("../../drizzle/meta/_journal.json?raw");

describe("D-012C workflow instance persistence contract", () => {
  it("reutiliza workflow_executions com posição atual e correlationId nullable", async () => {
    const { default: schema } = await loadSchema();

    expect(schema).toContain('currentNodeId: varchar("current_node_id", { length: 120 })');
    expect(schema).toContain('correlationId: varchar("correlation_id", { length: 160 })');
    expect(schema).toContain('index("workflow_executions_correlation_idx").on(table.correlationId)');
    expect(schema).not.toContain('mysqlTable("workflow_instances"');
  });

  it("mantém a migration 0010 estritamente aditiva e restrita a workflow_executions", async () => {
    const { default: migration } = await loadMigration();

    expect(migration).toContain("ALTER TABLE `workflow_executions`");
    expect(migration).toContain("ADD `current_node_id` varchar(120) NULL");
    expect(migration).toContain("ADD `correlation_id` varchar(160) NULL");
    expect(migration).toContain("CREATE INDEX `workflow_executions_correlation_idx`");
    expect(migration).not.toContain("DROP ");
    expect(migration).not.toContain("DELETE FROM");
    expect(migration).not.toContain("UPDATE `incidents`");
    expect(migration).not.toContain("ALTER TABLE `incidents`");
  });

  it("registra a migration no journal para impedir arquivo SQL fora do controle do Drizzle", async () => {
    const { default: rawJournal } = await loadJournal();
    const journal = JSON.parse(rawJournal) as { entries: Array<{ idx: number; tag: string }> };
    const latest = journal.entries.at(-1);

    expect(latest).toMatchObject({
      idx: 10,
      tag: "0010_d012c_workflow_instance_state",
    });
  });
});
