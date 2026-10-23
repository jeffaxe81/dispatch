import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { integrationCircuitState } from "../drizzle/integrationCircuitSchema";

const tableName = (table: unknown) =>
  (table as { [key: symbol]: unknown })[Symbol.for("drizzle:Name")];

describe("D-012J J26 — schema do circuit breaker", () => {
  it("define uma linha única por tenant e sistema com versão CAS", () => {
    expect(tableName(integrationCircuitState)).toBe("integration_circuit_state");
    expect(integrationCircuitState.organizationId).toBeDefined();
    expect(integrationCircuitState.system).toBeDefined();
    expect(integrationCircuitState.state).toBeDefined();
    expect(integrationCircuitState.circuitVersion).toBeDefined();
    expect(integrationCircuitState.consecutiveFailures).toBeDefined();
    expect(integrationCircuitState.openedAtMs).toBeDefined();
    expect(integrationCircuitState.cooldownUntilMs).toBeDefined();
  });

  it("versiona migration aditiva sem grant, scheduler ou transporte", () => {
    const sql = readFileSync(
      new URL("../drizzle/0019_d012j_integration_circuit_state.sql", import.meta.url),
      "utf8",
    ).toLowerCase();
    expect(sql).toContain("create table `integration_circuit_state`");
    expect(sql).toContain("unique index `integration_circuit_tenant_system_unique`");
    expect(sql).toContain("`organization_id`,`system`");
    expect(sql).toContain("foreign key (`organization_id`)");
    for (const forbidden of ["grant ", "scheduler", "http", "authorization", "payload"]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});
