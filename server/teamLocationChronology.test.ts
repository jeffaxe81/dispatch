import { readFileSync } from "node:fs";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { teamLocationAdvancePredicate } from "./dbLegacy";

describe("R055: monotonic GPS latest-position snapshot", () => {
  it("compiles an atomic tenant-team update guard for a newer timestamp", () => {
    const capturedAt = new Date("2026-11-07T12:34:56.000Z");
    const condition = teamLocationAdvancePredicate(42, capturedAt);
    expect(condition).toBeDefined();
    const query = new MySqlDialect().sqlToQuery(condition!);

    // MySQL rechecks this condition under the row lock even when two
    // reports arrive concurrently; delayed or equal-time reports cannot win.
    expect(query.sql).toMatch(/teams.*id.*= \?/i);
    expect(query.sql).toMatch(/last_location_at.*is null/i);
    expect(query.sql).toMatch(/last_location_at.*< \?/i);
    expect(query.sql).toMatch(/\bor\b/i);
    expect(query.params).toHaveLength(2);
    expect(query.params[0]).toBe(42);
  });

  it("uses the timestamp condition in the real team snapshot update", () => {
    const source = readFileSync(new URL("./dbLegacy.ts", import.meta.url), "utf8");
    const position = source.indexOf("export async function recordTeamLocation(");
    expect(position).toBeGreaterThan(-1);
    const implementation = source.slice(position, position + 1700);
    expect(implementation).toContain(
      ".where(teamLocationAdvancePredicate(input.teamId, input.capturedAt))"
    );
    expect(implementation).toContain("await tx.insert(teamLocations)");
  });
});
