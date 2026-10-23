import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { integrationCircuitState } from "../drizzle/integrationCircuitSchema";

describe("D-012J J27 — persistência do lease de probe", () => {
  it("adiciona campos de fencing ao estado do circuito", () => {
    expect(integrationCircuitState.probeLeaseOwner).toBeDefined();
    expect(integrationCircuitState.probeLeaseToken).toBeDefined();
    expect(integrationCircuitState.probeLeaseExpiresAtMs).toBeDefined();
  });

  it("versiona alteração aditiva sem habilitar scheduler/probe externo", () => {
    const sql = readFileSync(
      new URL("../drizzle/0020_d012j_circuit_probe_lease.sql", import.meta.url),
      "utf8",
    ).toLowerCase();
    expect(sql).toContain("alter table `integration_circuit_state`");
    expect(sql).toContain("`probe_lease_owner`");
    expect(sql).toContain("`probe_lease_token`");
    expect(sql).toContain("`probe_lease_expires_at_ms`");
    for (const forbidden of ["grant ", "scheduler", "http", "automatic replay"]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});
