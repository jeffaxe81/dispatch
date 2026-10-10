import { describe, expect, it } from "vitest";

const loadSchema = () => import("./workflowSlaEventIntentSchema.ts?raw");
const loadPersistence = () => import("./workflowSlaIntentPersistence.ts?raw");
const loadMigration = () => import("../../drizzle/0015_d012i_workflow_sla_intents.sql?raw");
const loadJournal = () => import("../../drizzle/meta/_journal.json?raw");
const loadConfig = () => import("../../drizzle.config.ts?raw");

describe("D-012I I4 — contrato de persistência segura", () => {
  it("mantém ledger lateral com chave única por tarefa/tipo", async () => {
    const { default: schema } = await loadSchema();
    const { default: migration } = await loadMigration();
    expect(schema).toContain('"workflow_sla_event_intents"');
    expect(schema).toContain("workflow_sla_intents_task_kind_unique");
    expect(schema).toContain("workflow_sla_intents_tenant_status_idx");
    expect(schema).toContain('status: mysqlEnum("status", ["pending", "delivered"])');
    expect(migration).toContain("CREATE TABLE `workflow_sla_event_intents`");
    expect(migration).toMatch(/CREATE UNIQUE INDEX `workflow_sla_intents_task_kind_unique`/);
    expect(migration).toContain("FOREIGN KEY (`task_id`)");
    expect(migration).not.toContain("ALTER TABLE `incidents`");
    expect(migration).not.toContain("DELETE FROM");
    expect(migration).not.toContain("DROP TABLE");
  });

  it("registra migration versionada sem executá-la ou pular a 0014", async () => {
    const { default: rawJournal } = await loadJournal();
    const journal = JSON.parse(rawJournal) as { entries: Array<{ idx: number; tag: string }> };
    expect(journal.entries).toContainEqual(
      expect.objectContaining({ idx: 14, tag: "0014_d012i_workflow_task_sla" }),
    );
    expect(journal.entries).toContainEqual(
      expect.objectContaining({ idx: 15, tag: "0015_d012i_workflow_sla_intents" }),
    );
    const { default: config } = await loadConfig();
    expect(config).toContain("./server/workflow/workflowSlaEventIntentSchema.ts");
  });

  it("usa lock na tarefa e escopo de tenant antes de inserir a intenção", async () => {
    const { default: source } = await loadPersistence();
    expect(source).toContain('for("update")');
    expect(source).toContain("workflowExecutionTenantScopes");
    expect(source).toContain("organizationId !== organizationId");
    expect(source).toContain("workflowVersions.definition");
    expect(source).toContain("calculateWorkflowSlaTimeline");
    expect(source).toContain("assertIntentMatches");
    expect(source).toContain("ER_DUP_ENTRY");
    expect(source).toContain('status: "pending"');
    expect(source).not.toContain("update(incidents)");
    expect(source).not.toContain("reassignWorkflowTask");
  });
});
