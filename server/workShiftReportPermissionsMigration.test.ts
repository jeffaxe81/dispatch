import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../drizzle/0006_d007d_work_shift_report_permissions.sql", import.meta.url);
const journalUrl = new URL("../drizzle/meta/_journal.json", import.meta.url);

describe("D-007D2 report permission migration", () => {
  it("cataloga view/export sem grants automáticos", () => {
    const sql = readFileSync(migrationUrl, "utf8");
    expect(sql).toContain("'work_shift_reports.view'");
    expect(sql).toContain("'work_shift_reports.export'");
    expect(sql).toContain("access_permissions");
    expect(sql).not.toContain("role_permissions");
  });

  it("preserva 0006 na sequência depois do checkpoint D1", () => {
    const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    expect(journal.entries.find(entry => entry.idx === 6)).toMatchObject({
      idx: 6,
      tag: "0006_d007d_work_shift_report_permissions",
    });
  });
});
