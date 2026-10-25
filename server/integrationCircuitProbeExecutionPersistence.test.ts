import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { integrationCircuitState } from "../drizzle/integrationCircuitSchema";

describe("D-012J J31 — persistência da intenção one-shot de probe", () => {
  it("expõe colunas persistentes de token, expiração e consumo", () => {
    expect(integrationCircuitState.probeExecutionToken).toBeDefined();
    expect(integrationCircuitState.probeExecutionExpiresAtMs).toBeDefined();
    expect(integrationCircuitState.probeExecutionConsumedAtMs).toBeDefined();
  });

  it("versiona migration 0021 aditiva sem ativar execução externa", () => {
    const sql = readFileSync(
      new URL("../drizzle/0021_d012j_probe_execution_intent.sql", import.meta.url),
      "utf8",
    ).toLowerCase();
    expect(sql).toContain("alter table `integration_circuit_state`");
    expect(sql).toContain("probe_execution_token");
    expect(sql).toContain("probe_execution_expires_at_ms");
    expect(sql).toContain("probe_execution_consumed_at_ms");
    for (const forbidden of ["grant ", "scheduler", "http://", "https://", "curl ", "fetch("]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});
