import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { createWorkflowSlaOperationalMetricsMySql } from "./workflowSlaOperationalMetricsMySql";

const now = "2026-10-22T21:00:00.000Z";

function fixture(values: unknown[] = ["3", "2", "1", "1", "2", "4", "60"]) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    async query(query: { sql: string }, params: unknown[] = []) {
      queries.push({ sql: query.sql, params });
      if (!/^select/i.test(query.sql)) throw new Error("SQL inesperado.");
      return [[values], []];
    },
  };
  return { db: drizzle({ client: client as never }), queries };
}

describe("D-012J J6B — agregação global por tenant no MySQL", () => {
  it("contabiliza toda a fila operacional elegível sem LIMIT nem PII", async () => {
    const f = fixture();
    const metrics = await createWorkflowSlaOperationalMetricsMySql(f.db as never).summarize({
      organizationId: 9, now,
    });
    expect(metrics).toEqual({
      pending: 3, leased: 2, deadLetter: 1, expiredLeases: 1,
      waitingRetries: 2, overdue: 4, maxLagMinutes: 60,
      generatedAt: now,
    });
    expect(Object.keys(metrics)).not.toContain("notificationBody");
    expect(f.queries).toHaveLength(1);
    const query = f.queries[0];
    expect(query.sql.toLowerCase()).toContain("workflow_sla_event_intents");
    expect(query.sql.toLowerCase()).toContain("workflow_tasks");
    expect(query.sql.toLowerCase()).toContain("workflow_execution_tenant_scopes");
    expect(query.sql.toLowerCase()).toContain("unix_timestamp");
    expect(query.sql.toLowerCase()).not.toContain(" limit ");
    expect(query.params.filter(value => value === 9)).toHaveLength(2);
    expect(query.params).toEqual(expect.arrayContaining([
      "open", "in_progress", "pending", "leased", "dead_letter",
    ]));
  });

  it("retorna zero quando o tenant não possui itens elegíveis", async () => {
    const f = fixture(["0", "0", "0", "0", "0", "0", "0"]);
    expect(await createWorkflowSlaOperationalMetricsMySql(f.db as never).summarize({
      organizationId: 9, now,
    })).toEqual({
      pending: 0, leased: 0, deadLetter: 0, expiredLeases: 0,
      waitingRetries: 0, overdue: 0, maxLagMinutes: 0, generatedAt: now,
    });
  });

  it("recusa tenant, instante UTC e calendário inválidos antes da consulta", async () => {
    const f = fixture();
    const store = createWorkflowSlaOperationalMetricsMySql(f.db as never);
    for (const input of [
      { organizationId: 0, now },
      { organizationId: 1.5, now },
      { organizationId: 9, now: "2026-02-30T21:00:00.000Z" },
      { organizationId: 9, now: "2026-10-22 21:00:00" },
    ]) {
      await expect(store.summarize(input)).rejects.toThrow();
    }
    expect(f.queries).toHaveLength(0);
  });

  it("falha fechado para números inválidos, perdas de colunas ou agregados incoerentes", async () => {
    for (const values of [
      ["NaN", "0", "0", "0", "0", "0", "0"],
      ["2.5", "0", "0", "0", "0", "0", "0"],
      [null, "0", "0", "0", "0", "0", "0"],
      ["1", "0", "0", "0", "2", "0", "0"],
      ["0", "1", "0", "2", "0", "0", "0"],
      ["1", "0", "0", "0", "0", "2", "0"],
    ]) {
      const f = fixture(values);
      await expect(createWorkflowSlaOperationalMetricsMySql(f.db as never).summarize({
        organizationId: 9, now,
      })).rejects.toThrow();
    }
  });
});
