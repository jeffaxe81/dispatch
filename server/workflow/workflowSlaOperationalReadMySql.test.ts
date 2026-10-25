import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { createWorkflowSlaOperationalReadMySql } from "./workflowSlaOperationalReadMySql";

function fixture() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const client = {
    async query(query: { sql: string }, params: unknown[] = []) {
      queries.push({ sql: query.sql, params });
      if (!/^select/.test(query.sql)) throw new Error(`Unexpected query ${query.sql}`);
      return [[[
        11,
        21,
        9,
        "reminder",
        "pending",
        "open",
        77,
        "2026-10-21 20:15:00",
        "corr-11",
        0,
      ]], []];
    },
  };
  return { db: drizzle({ client: client as never }), queries };
}

describe("D-012J — MySQL SLA operational read store", () => {
  it("consulta somente SLA operacional no tenant e escopo da execução", async () => {
    const f = fixture();
    const rows = await createWorkflowSlaOperationalReadMySql(f.db as never).list({
      organizationId: 9,
      limit: 20,
      now: "2026-10-21T20:00:00.000Z",
    });

    expect(rows).toEqual([expect.objectContaining({
      intentId: 11,
      taskId: 21,
      organizationId: 9,
      eventKind: "reminder",
      deliveryStatus: "pending",
      taskStatus: "open",
      assigneeUserId: 77,
      scheduledAt: "2026-10-21T20:15:00.000Z",
    })]);

    const sql = f.queries[0].sql;
    expect(sql).toContain("workflow_sla_event_intents");
    expect(sql).toContain("workflow_tasks");
    expect(sql).toContain("workflow_execution_tenant_scopes");
    expect(sql).toContain("organization_id");
    expect(sql).toContain("workflow_version_id");
    expect(sql).toContain("node_id");
    expect(f.queries[0].params.filter(value => value === 9)).toHaveLength(2);
    expect(f.queries[0].params).toEqual(expect.arrayContaining([
      "open", "in_progress", "pending", "leased", "dead_letter",
    ]));
  });

  it("rejeita parâmetros inválidos antes de consultar o banco", async () => {
    const f = fixture();
    const store = createWorkflowSlaOperationalReadMySql(f.db as never);
    await expect(store.list({ organizationId: 0, limit: 20, now: "2026-10-21T20:00:00.000Z" })).rejects.toThrow(/parâmetros/i);
    await expect(store.list({ organizationId: 9, limit: 101, now: "2026-10-21T20:00:00.000Z" })).rejects.toThrow(/parâmetros/i);
    expect(f.queries).toHaveLength(0);
  });
});
