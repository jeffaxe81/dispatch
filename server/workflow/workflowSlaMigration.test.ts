import { describe, expect, it } from "vitest";

const loadSchema = () => import("./workflowTaskSchema.ts?raw");
const loadMigration = () => import("../../drizzle/0014_d012i_workflow_task_sla.sql?raw");
const loadJournal = () => import("../../drizzle/meta/_journal.json?raw");

describe("D-012I I3-A — persistência temporal da tarefa", () => {
  it("projeta timestamps SLA opcionais na própria workflow_tasks", async () => {
    const { default: schema } = await loadSchema();

    expect(schema).toContain('slaStartedAt: timestamp("sla_started_at")');
    expect(schema).toContain('slaReminderAt: timestamp("sla_reminder_at")');
    expect(schema).toContain('slaDueAt: timestamp("sla_due_at")');
    expect(schema).toContain('slaEscalationAt: timestamp("sla_escalation_at")');
    expect(schema).toContain('index("workflow_tasks_sla_due_idx").on(table.status, table.slaDueAt)');
    expect(schema).not.toContain('mysqlTable("workflow_task_sla"');
  });

  it("mantém a migration 0014 estritamente aditiva e restrita a workflow_tasks", async () => {
    const { default: migration } = await loadMigration();

    expect(migration).toContain("ALTER TABLE `workflow_tasks`");
    expect(migration).toContain("ADD `sla_started_at` timestamp NULL");
    expect(migration).toContain("ADD `sla_reminder_at` timestamp NULL");
    expect(migration).toContain("ADD `sla_due_at` timestamp NULL");
    expect(migration).toContain("ADD `sla_escalation_at` timestamp NULL");
    expect(migration).toContain("CREATE INDEX `workflow_tasks_sla_due_idx`");
    expect(migration).not.toContain("DROP ");
    expect(migration).not.toContain("DELETE FROM");
    expect(migration).not.toContain("UPDATE `incidents`");
    expect(migration).not.toContain("ALTER TABLE `incidents`");
  });

  it("registra a migration 0014 no journal sem reordenar as anteriores", async () => {
    const { default: rawJournal } = await loadJournal();
    const journal = JSON.parse(rawJournal) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(journal.entries.at(-2)).toMatchObject({
      idx: 13,
      tag: "0013_d012f_workflow_event_receipts",
    });
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 14,
      tag: "0014_d012i_workflow_task_sla",
    });
  });
});
