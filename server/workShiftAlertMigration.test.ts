import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../drizzle/0007_d007d_work_shift_alerts.sql", import.meta.url);
const journalUrl = new URL("../drizzle/meta/_journal.json", import.meta.url);

describe("D-007D3 alert migration contract", () => {
  it("materializa alertas indexados e permissões sem grants automáticos", () => {
    const sql = readFileSync(migrationUrl, "utf8");
    expect(sql).toContain("CREATE TABLE `work_shift_alerts`");
    expect(sql).toContain("`dedupe_key`");
    expect(sql).toContain("`status`");
    expect(sql).toContain("`detected_at`");
    expect(sql).toContain("`user_id`");
    expect(sql).toContain("`team_id`");
    expect(sql).toContain("`session_id`");
    expect(sql).toContain("'work_shift_alerts.view'");
    expect(sql).toContain("'work_shift_alerts.manage'");
    expect(sql).not.toContain("role_permissions");
    expect(sql).not.toMatch(/UNIQUE[^\n]+dedupe_key/i);
  });

  it("registra a migration 0007 depois das permissões de relatório", () => {
    const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    expect(journal.entries.find(entry => entry.idx === 7)).toMatchObject({
      idx: 7,
      tag: "0007_d007d_work_shift_alerts",
    });
  });
});
