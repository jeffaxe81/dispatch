import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const MYSQL_IDENTIFIER_LIMIT = 64;

type JournalEntry = { tag: string };
type Journal = { entries: JournalEntry[] };

describe("MySQL migration identifier contract", () => {
  it("keeps named constraints and indexes within MySQL's 64-character limit", () => {
    const journal = JSON.parse(
      readFileSync("drizzle/meta/_journal.json", "utf8"),
    ) as Journal;

    const violations: string[] = [];

    for (const { tag } of journal.entries) {
      const migrationPath = path.join("drizzle", `${tag}.sql`);
      const sql = readFileSync(migrationPath, "utf8");
      const identifierPattern = /\b(?:CONSTRAINT|INDEX)\s+`([^`]+)`/g;

      for (const match of sql.matchAll(identifierPattern)) {
        const identifier = match[1];
        if (identifier.length > MYSQL_IDENTIFIER_LIMIT) {
          violations.push(`${tag}: ${identifier} (${identifier.length})`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
