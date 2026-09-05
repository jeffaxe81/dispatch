import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../drizzle/0005_d007d_work_shift_adjustments.sql", import.meta.url);
const journalUrl = new URL("../drizzle/meta/_journal.json", import.meta.url);

describe("D-007D1 adjustment migration contract", () => {
  it("materializa ajustes auditáveis e permissões sem grants automáticos", () => {
    const sql = readFileSync(migrationUrl, "utf8");

    expect(sql).toContain("CREATE TABLE `work_shift_adjustments`");
    expect(sql).toContain("`session_id` int NOT NULL");
    expect(sql).toContain("`requested_by_user_id` int NOT NULL");
    expect(sql).toContain("`status`");
    expect(sql).toContain("`before_snapshot` json NOT NULL");
    expect(sql).toContain("`requested_changes` json NOT NULL");
    expect(sql).toContain("'work_shifts.adjust'");
    expect(sql).toContain("'work_shifts.approve'");
    expect(sql).not.toContain("role_permissions");
  });

  it("registra somente a migration 0005 depois da D-007B", () => {
    const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(journal.entries.at(-1)).toMatchObject({ idx: 5, tag: "0005_d007d_work_shift_adjustments" });
  });
});
