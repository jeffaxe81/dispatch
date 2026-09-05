import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../drizzle/0004_d007b_work_shift_schedules.sql", import.meta.url);
const journalUrl = new URL("../drizzle/meta/_journal.json", import.meta.url);

describe("D-007B migration contract", () => {
  it("materializa tabelas, snapshot de sessão e permissões sem grants automáticos", () => {
    const sql = readFileSync(migrationUrl, "utf8");

    expect(sql).toContain("CREATE TABLE `work_shift_schedules`");
    expect(sql).toContain("CREATE TABLE `work_shift_assignments`");
    expect(sql).toContain("CREATE TABLE `work_shift_schedule_exceptions`");
    expect(sql).toContain("ADD `schedule_assignment_id`");
    expect(sql).toContain("ADD `scheduled_start_at`");
    expect(sql).toContain("ADD `scheduled_end_at`");
    expect(sql).toContain("'work_shift_schedules.view'");
    expect(sql).toContain("'work_shift_schedules.manage'");
    expect(sql).not.toContain("role_permissions");
  });

  it("registra a migration no journal sem alterar migrations anteriores", () => {
    const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(journal.entries.slice(0, 4).map(entry => entry.tag)).toEqual([
      "0000_useful_giant_man",
      "0001_abandoned_kinsey_walden",
      "0002_aromatic_warhawk",
      "0003_d007a_work_shift_history",
    ]);
    expect(journal.entries[4]).toMatchObject({ idx: 4, tag: "0004_d007b_work_shift_schedules" });
  });
});
