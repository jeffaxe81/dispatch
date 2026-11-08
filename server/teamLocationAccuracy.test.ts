import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertAcceptableTeamLocationAccuracy,
  MAX_REPORTED_GPS_ACCURACY_METERS,
} from "./teamLocationAccuracy";

describe("R056 — GPS accuracy quality gate", () => {
  it.each([
    ["missing (legacy compatibility)", undefined],
    ["perfect estimate", 0],
    ["high accuracy", 5],
    ["moderate accuracy", 120],
    ["maximum supported estimate", MAX_REPORTED_GPS_ACCURACY_METERS],
  ])("accepts %s", (_name, accuracy) => {
    expect(() => assertAcceptableTeamLocationAccuracy(accuracy)).not.toThrow();
  });

  it.each([
    ["above limit", MAX_REPORTED_GPS_ACCURACY_METERS + 0.01],
    ["very poor signal", 10000],
    ["negative estimate", -1],
    ["not a number", NaN],
    ["positive infinity", Infinity],
    ["negative infinity", -Infinity],
  ])("rejects %s", (_name, accuracy) => {
    expect(() => assertAcceptableTeamLocationAccuracy(accuracy)).toThrow(
      /precisão estimada do GPS/
    );
  });

  it("enforces permission and freshness before the accuracy gate and DB write", () => {
    const code = readFileSync(new URL("./tenantAwareAppRouter.ts", import.meta.url), "utf8");
    const section = code.slice(
      code.indexOf("    recordLocation: operationalProcedure"),
      code.indexOf("  vehicles: router(")
    );
    const tenant = section.indexOf("await assertTeamTenant(");
    const permission = section.indexOf("await assertTeamScope(");
    const ownership = section.indexOf("assertOwnTeam(");
    const freshness = section.indexOf("assertRecentTeamLocation(");
    const accuracy = section.indexOf("assertAcceptableTeamLocationAccuracy(");
    const persistence = section.indexOf("await recordTeamLocation(");
    expect(tenant).toBeGreaterThan(0);
    expect(permission).toBeGreaterThan(tenant);
    expect(ownership).toBeGreaterThan(permission);
    expect(freshness).toBeGreaterThan(ownership);
    expect(accuracy).toBeGreaterThan(freshness);
    expect(persistence).toBeGreaterThan(accuracy);
  });
});
