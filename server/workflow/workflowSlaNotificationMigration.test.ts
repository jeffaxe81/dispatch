import { describe, expect, it } from "vitest";

describe("I5D — armazenamento durável das notificações internas", () => {
  it("versiona criação aditiva, índices de deduplicação e referências restritivas", async () => {
    const [{ default: ddl }, { default: rawJournal }, { default: config }] =
      await Promise.all([
        import("../../drizzle/0017_d012i_workflow_sla_notifications.sql?raw"),
        import("../../drizzle/meta/_journal.json?raw"),
        import("../../drizzle.config.ts?raw"),
      ]);
    const journal = JSON.parse(rawJournal);
    expect(
      journal.entries.find((entry: { idx: number }) => entry.idx === 17)
    ).toMatchObject({ tag: "0017_d012i_workflow_sla_notifications" });
    expect(ddl).toMatch(/CREATE TABLE `workflow_sla_notifications`/);
    expect(ddl).toMatch(/UNIQUE INDEX .*\(`intent_id`\)/);
    expect(ddl).toMatch(/UNIQUE INDEX .*\(`organization_id`,`event_key`\)/);
    expect(ddl).toMatch(
      /REFERENCES `workflow_sla_event_intents`\(`id`\) ON DELETE restrict/i
    );
    expect(ddl).not.toMatch(/DROP |TRUNCATE |DELETE FROM|UPDATE |GRANT /i);
    expect(config).toContain(
      "./server/workflow/workflowSlaNotificationSchema.ts"
    );
  });
});
